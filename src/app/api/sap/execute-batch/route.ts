import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/api-auth';
import { ensureRecentBackup } from '@/lib/backup';
import type { ETLInvoice } from '@/lib/etl';

// ─── Request / Response Types ───────────────────────────────────────────────

interface SapBatchAction {
  type: 'CREATE' | 'UPDATE';
  etlInvoice: ETLInvoice;
  targetInvoiceId?: string; // required for UPDATE
  overrides?: {
    billingMonth?: string;
    amountOverride?: number;
  };
}

interface SapBatchRequest {
  actions: SapBatchAction[];
  batchIndex: number;
  totalBatches: number;
  dataYear?: number;
}

interface SapBatchResult {
  success: boolean;
  batchIndex: number;
  totalBatches: number;
  created: { vendors: number; subscriptions: number; invoices: number; lineItems: number };
  updated: { invoices: number; lineItems: number };
  errors: string[];
  backupId?: string | null;
}

// Generate logo URL from vendor name (same helper as CSV import)
function generateLogoUrl(name: string): string {
  const domain = name.replace(/\s+/g, '').toLowerCase() + '.com';
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

/**
 * POST /api/sap/execute-batch
 *
 * Writes approved SAP import actions to Supabase in batches.
 * Each action either creates a new invoice or updates an existing one.
 */
export async function POST(request: Request) {
  const { response } = await requireAuth();
  if (response) return response;

  try {
    const body: SapBatchRequest = await request.json();
    const { actions, batchIndex, totalBatches, dataYear } = body;

    if (!actions || !Array.isArray(actions) || actions.length === 0) {
      return NextResponse.json(
        { error: 'No actions provided' },
        { status: 400 }
      );
    }

    // --- Service-role Supabase client (bypasses RLS) ---
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // --- Auto-backup on first batch ---
    let backupId: string | null = null;
    if (batchIndex === 0) {
      try {
        const backupResult = await ensureRecentBackup();
        backupId = backupResult.backup_id;
      } catch (err) {
        console.warn('Auto-backup check failed (non-fatal):', err);
      }
    }

    const result: SapBatchResult = {
      success: true,
      batchIndex,
      totalBatches,
      created: { vendors: 0, subscriptions: 0, invoices: 0, lineItems: 0 },
      updated: { invoices: 0, lineItems: 0 },
      errors: [],
      backupId,
    };

    // --- Caches to avoid redundant DB lookups within the batch ---
    const vendorCache = new Map<string, { id: string; name: string; logoUrl: string }>();
    const subscriptionCache = new Map<string, { id: string }>();

    for (const action of actions) {
      try {
        const { etlInvoice } = action;
        const vendorName = etlInvoice.supabaseVendor;

        // ── Resolve vendor ──────────────────────────────────────────────
        let vendor = vendorCache.get(vendorName.toLowerCase());
        if (!vendor) {
          const { data: existing } = await supabase
            .from('sub_vendors')
            .select('id, name, logo_url')
            .ilike('name', vendorName)
            .limit(1)
            .single();

          if (existing) {
            vendor = { id: existing.id, name: existing.name, logoUrl: existing.logo_url };
          } else {
            // Create new vendor
            const logoUrl = generateLogoUrl(vendorName);
            const { data: created, error: createErr } = await supabase
              .from('sub_vendors')
              .insert({ name: vendorName, logo_url: logoUrl })
              .select('id, name, logo_url')
              .single();

            if (createErr || !created) {
              throw new Error(`Failed to create vendor "${vendorName}": ${createErr?.message}`);
            }
            vendor = { id: created.id, name: created.name, logoUrl: created.logo_url };
            result.created.vendors++;
          }
          vendorCache.set(vendorName.toLowerCase(), vendor);
        }

        // ── Resolve subscription ("Master Agreement") ───────────────────
        let subscription = subscriptionCache.get(vendor.id);
        if (!subscription) {
          const { data: existingSub } = await supabase
            .from('sub_subscriptions')
            .select('id')
            .eq('vendor_id', vendor.id)
            .ilike('name', '%Master Agreement%')
            .limit(1)
            .single();

          if (existingSub) {
            subscription = { id: existingSub.id };
          } else {
            const { data: createdSub, error: subErr } = await supabase
              .from('sub_subscriptions')
              .insert({
                vendor_id: vendor.id,
                name: `${vendor.name} Master Agreement`,
                status: 'Active',
                billing_cycle: 'Monthly',
                payment_method: 'Invoice',
                logo: vendor.logoUrl,
              })
              .select('id')
              .single();

            if (subErr || !createdSub) {
              throw new Error(`Failed to create subscription for "${vendor.name}": ${subErr?.message}`);
            }
            subscription = { id: createdSub.id };
            result.created.subscriptions++;
          }
          subscriptionCache.set(vendor.id, subscription);
        }

        // ── Resolve overrides ─────────────────────────────────────────
        const effectiveBillingMonth = action.overrides?.billingMonth || etlInvoice.billingMonth;
        const effectiveAmount = action.overrides?.amountOverride ??
          (etlInvoice.computedAmount !== etlInvoice.rawAmount ? etlInvoice.computedAmount : etlInvoice.rawAmount);

        // ── Execute action ──────────────────────────────────────────────
        if (action.type === 'CREATE') {
          // Insert new invoice
          const { data: newInvoice, error: invErr } = await supabase
            .from('sub_invoices')
            .insert({
              vendor_id: vendor.id,
              subscription_id: subscription.id,
              invoice_number: `SAP-${etlInvoice.groupKey}`,
              invoice_date: effectiveBillingMonth,
              total_amount: effectiveAmount,
              currency: 'USD',
              status: 'Paid',
            })
            .select('id')
            .single();

          if (invErr || !newInvoice) {
            throw new Error(`Failed to create invoice: ${invErr?.message}`);
          }
          result.created.invoices++;

          // Insert line items from ETL invoice's classified rows
          const lineItems = etlInvoice.lineItems.map((row) => ({
            invoice_id: newInvoice.id,
            description: row.description || `${row.businessPartner} - ${row.postingDate}`,
            quantity: 1,
            unit_price: row.debitAmount > 0 ? row.debitAmount : -row.creditAmount,
            total_amount: row.debitAmount > 0 ? row.debitAmount : -row.creditAmount,
          }));

          if (lineItems.length > 0) {
            const { error: liErr } = await supabase
              .from('sub_invoice_line_items')
              .insert(lineItems);

            if (liErr) {
              throw new Error(`Failed to insert line items: ${liErr.message}`);
            }
            result.created.lineItems += lineItems.length;
          }

        } else if (action.type === 'UPDATE') {
          if (!action.targetInvoiceId) {
            throw new Error('UPDATE action requires targetInvoiceId');
          }

          // Update existing invoice
          const { error: updErr } = await supabase
            .from('sub_invoices')
            .update({
              total_amount: effectiveAmount,
              invoice_date: effectiveBillingMonth,
            })
            .eq('id', action.targetInvoiceId);

          if (updErr) {
            throw new Error(`Failed to update invoice ${action.targetInvoiceId}: ${updErr.message}`);
          }
          result.updated.invoices++;

          // Delete old line items
          const { error: delErr } = await supabase
            .from('sub_invoice_line_items')
            .delete()
            .eq('invoice_id', action.targetInvoiceId);

          if (delErr) {
            throw new Error(`Failed to delete old line items: ${delErr.message}`);
          }

          // Insert new line items
          const lineItems = etlInvoice.lineItems.map((row) => ({
            invoice_id: action.targetInvoiceId!,
            description: row.description || `${row.businessPartner} - ${row.postingDate}`,
            quantity: 1,
            unit_price: row.debitAmount > 0 ? row.debitAmount : -row.creditAmount,
            total_amount: row.debitAmount > 0 ? row.debitAmount : -row.creditAmount,
          }));

          if (lineItems.length > 0) {
            const { error: liErr } = await supabase
              .from('sub_invoice_line_items')
              .insert(lineItems);

            if (liErr) {
              throw new Error(`Failed to insert updated line items: ${liErr.message}`);
            }
            result.updated.lineItems += lineItems.length;
          }
        }
        // Mark override as imported (if one exists for this groupKey)
        if (dataYear && etlInvoice.groupKey) {
          await supabase
            .from('sub_etl_overrides')
            .update({ imported_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('group_key', etlInvoice.groupKey)
            .eq('data_year', dataYear);
        }
      } catch (actionError) {
        const msg = actionError instanceof Error ? actionError.message : String(actionError);
        result.errors.push(msg);
      }
    }

    result.success = result.errors.length === 0;
    return NextResponse.json(result);
  } catch (error) {
    console.error('SAP execute-batch error:', error);
    return NextResponse.json(
      { error: 'SAP batch execution failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}
