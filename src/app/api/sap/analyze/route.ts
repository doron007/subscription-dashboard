import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/api-auth';
import {
  fetchODataLive,
  classifyRows,
  reconstructInvoices,
  matchInvoices,
  VendorMatcher,
  type SupabaseInvoice,
  type SapImportAnalysis,
} from '@/lib/etl';

/**
 * POST /api/sap/analyze
 *
 * Read-only analysis route. Fetches SAP GL data via OData, runs the ETL
 * pipeline (classify -> reconstruct -> match), and returns a comparison
 * against the current Supabase invoices. Zero writes.
 */
export async function POST(request: Request) {
  const { response } = await requireAuth();
  if (response) return response;

  try {
    const body = await request.json().catch(() => ({}));
    const dataYear = body.year ?? new Date().getFullYear();

    // --- Validate SAP OData credentials are configured ---
    const baseUrl = process.env.SAP_ODATA_BASE_URL;
    const username = process.env.SAP_ODATA_USERNAME;
    const password = process.env.SAP_ODATA_PASSWORD;

    if (!baseUrl || !username || !password) {
      return NextResponse.json(
        { error: 'SAP OData credentials are not configured on the server.' },
        { status: 500 }
      );
    }

    // --- Service-role Supabase client (bypasses RLS for read queries) ---
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // --- Step 1: Build VendorMatcher from all known vendor names ---
    const { data: vendors, error: vendorError } = await supabase
      .from('sub_vendors')
      .select('name');

    if (vendorError) {
      throw new Error(`Failed to query vendors: ${vendorError.message}`);
    }

    const matcher = new VendorMatcher();
    matcher.build((vendors || []).map((v: { name: string }) => v.name));

    // --- Step 2: Fetch SAP OData GL rows ---
    const fetchStart = Date.now();
    let sapRows;
    try {
      sapRows = await fetchODataLive({ baseUrl, username, password, year: dataYear });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `SAP OData connection failed: ${msg}` },
        { status: 502 }
      );
    }
    const fetchDurationMs = Date.now() - fetchStart;

    // --- Step 3: Classify rows ---
    // classifyRows uses module-level vendor maps + optional fuzzy matcher for BPs
    // not in the static BP_TO_SUPABASE map (e.g., AMAZON WEB SERVICES INC)
    const classified = classifyRows(sapRows, matcher);

    // Build classification counts
    const classification: Record<string, number> = {};
    for (const row of classified) {
      classification[row.classification] = (classification[row.classification] || 0) + 1;
    }

    // --- Step 4: Reconstruct invoices ---
    const etlInvoices = reconstructInvoices(classified);

    // --- Step 5: Query Supabase invoices for the target year ---
    // Include prior year Q4 to catch cross-year matches (e.g., Dec 2025 service posted in Jan 2026)
    const yearStart = `${dataYear - 1}-10-01`;
    const yearEnd = `${dataYear}-12-31`;

    const { data: invoiceRows, error: invError } = await supabase
      .from('sub_invoices')
      .select(`
        id,
        invoice_number,
        invoice_date,
        total_amount,
        vendor_id,
        sub_vendors!inner ( name ),
        sub_invoice_line_items ( id, description, quantity, unit_price, total_amount, period_start, period_end )
      `)
      .gte('invoice_date', yearStart)
      .lte('invoice_date', yearEnd);

    if (invError) {
      throw new Error(`Failed to query invoices: ${invError.message}`);
    }

    const supabaseInvoices: SupabaseInvoice[] = (invoiceRows || []).map((row: any) => {
      const rawLineItems = Array.isArray(row.sub_invoice_line_items) ? row.sub_invoice_line_items : [];
      return {
        id: row.id,
        vendor_name: row.sub_vendors?.name ?? '',
        vendor_id: row.vendor_id,
        invoice_number: row.invoice_number,
        invoice_date: row.invoice_date,
        total_amount: row.total_amount,
        line_item_count: rawLineItems.length,
        lineItems: rawLineItems.map((li: any) => ({
          id: li.id,
          description: li.description || '',
          quantity: li.quantity,
          unit_price: li.unit_price,
          total_amount: li.total_amount || 0,
          period_start: li.period_start,
          period_end: li.period_end,
        })),
      };
    });

    // --- Step 6: Match ETL invoices against Supabase ---
    const matchResults = matchInvoices(etlInvoices, supabaseInvoices);

    // Separate into buckets
    const matched: SapImportAnalysis['matched'] = [];
    const newInvoices: SapImportAnalysis['newInvoices'] = [];
    const matchedSupabaseIds = new Set<string>();

    for (const mr of matchResults) {
      if (mr.supabaseInvoice && mr.matchType !== 'NONE') {
        const matchEntry: SapImportAnalysis['matched'][number] = {
          etl: mr.etlInvoice,
          supabase: mr.supabaseInvoice,
          matchType: mr.matchType as 'EXACT' | 'CLOSE' | 'MONTH_MATCH' | 'MONTHLY_TOTAL',
          amountDiff: mr.amountDiff,
        };
        if (mr.supabaseInvoiceGroup) {
          matchEntry.supabaseGroup = mr.supabaseInvoiceGroup;
          for (const sub of mr.supabaseInvoiceGroup) {
            matchedSupabaseIds.add(sub.id);
          }
        }
        matched.push(matchEntry);
        matchedSupabaseIds.add(mr.supabaseInvoice.id);
      } else {
        newInvoices.push(mr.etlInvoice);
      }
    }

    // Only show DB-only invoices from the target year (not Q4 prior year used for cross-year matching)
    const yearPrefix = `${dataYear}-`;
    const supabaseOnly = supabaseInvoices.filter(
      (si) => !matchedSupabaseIds.has(si.id) && si.invoice_date >= yearPrefix
    );

    // --- Step 6.5: Load persisted overrides and detect conflicts ---
    const { data: overrideRows } = await supabase
      .from('sub_etl_overrides')
      .select('*')
      .eq('data_year', dataYear);

    const overrides: Record<string, import('@/lib/etl/types').ETLOverride> = {};
    for (const row of overrideRows || []) {
      // Find corresponding ETL invoice to check for conflicts
      const allEtl = [...matched.map(m => m.etl), ...newInvoices];
      const etl = allEtl.find(e => e.groupKey === row.group_key);
      const currentAmount = etl?.computedAmount ?? etl?.rawAmount;
      const conflict = row.sap_amount != null && currentAmount != null
        ? Math.abs(row.sap_amount - currentAmount) > 0.05
        : false;

      overrides[row.group_key] = {
        id: row.id,
        groupKey: row.group_key,
        vendorName: row.vendor_name,
        dataYear: row.data_year,
        billingMonthOverride: row.billing_month_override || undefined,
        amountOverride: row.amount_override != null ? parseFloat(row.amount_override) : undefined,
        importAction: row.import_action,
        sapAmount: row.sap_amount != null ? parseFloat(row.sap_amount) : undefined,
        notes: row.notes || undefined,
        importedAt: row.imported_at || undefined,
        conflict,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }

    // --- Build warnings ---
    const warnings: string[] = [];
    if (sapRows.length === 0) {
      warnings.push('No rows returned from SAP OData. Check credentials and endpoint URL.');
    }
    if (etlInvoices.length === 0 && sapRows.length > 0) {
      warnings.push('SAP returned rows but no invoices could be reconstructed. Check vendor mappings.');
    }
    const conflictCount = Object.values(overrides).filter(o => o.conflict).length;
    if (conflictCount > 0) {
      warnings.push(`${conflictCount} override(s) have conflicts — SAP amounts changed since your last decision.`);
    }

    const analysis: SapImportAnalysis = {
      sapMeta: {
        totalGLRows: sapRows.length,
        classification,
        etlInvoiceCount: etlInvoices.length,
        dataYear,
        fetchDurationMs,
      },
      matched,
      newInvoices,
      supabaseOnly,
      overrides,
      warnings,
    };

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('SAP analyze error:', error);
    return NextResponse.json(
      { error: 'SAP analysis failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}
