import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/api-auth';
import { matchInvoices, VendorMatcher, type ETLInvoice, type SupabaseInvoice, type SapImportAnalysis } from '@/lib/etl';

/**
 * POST /api/sap/rematch
 *
 * Lightweight re-matching endpoint. Takes ETL invoices (with user-overridden
 * billing months) and re-runs the matching algorithm against current Supabase
 * data. No OData fetch — just matching. Used when user changes a billing period.
 */
export async function POST(request: Request) {
  const { response } = await requireAuth();
  if (response) return response;

  try {
    const body = await request.json();
    const { etlInvoices, dataYear } = body as {
      etlInvoices: ETLInvoice[];
      dataYear: number;
    };

    if (!etlInvoices || !Array.isArray(etlInvoices)) {
      return NextResponse.json({ error: 'etlInvoices array required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Query Supabase invoices (same as analyze route)
    const yearStart = `${(dataYear || 2026) - 1}-10-01`;
    const yearEnd = `${dataYear || 2026}-12-31`;

    const { data: invoiceRows, error: invError } = await supabase
      .from('sub_invoices')
      .select(`
        id, invoice_number, invoice_date, total_amount, vendor_id,
        sub_vendors!inner ( name ),
        sub_invoice_line_items ( id, description, quantity, unit_price, total_amount, period_start, period_end )
      `)
      .gte('invoice_date', yearStart)
      .lte('invoice_date', yearEnd);

    if (invError) throw new Error(`Failed to query invoices: ${invError.message}`);

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

    // Re-run matching with the (potentially modified) ETL invoices
    const matchResults = matchInvoices(etlInvoices, supabaseInvoices);

    // Separate into buckets (same logic as analyze route)
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
          for (const sub of mr.supabaseInvoiceGroup) matchedSupabaseIds.add(sub.id);
        }
        matched.push(matchEntry);
        matchedSupabaseIds.add(mr.supabaseInvoice.id);
      } else {
        newInvoices.push(mr.etlInvoice);
      }
    }

    const supabaseOnly = supabaseInvoices.filter(si => !matchedSupabaseIds.has(si.id));

    return NextResponse.json({ matched, newInvoices, supabaseOnly });
  } catch (error) {
    console.error('SAP rematch error:', error);
    return NextResponse.json(
      { error: 'Re-match failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}
