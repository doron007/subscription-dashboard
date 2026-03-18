// ─── Invoice Matching ───────────────────────────────────────────────────────

import type { ETLInvoice, SupabaseInvoice, MatchResult } from './types';

/**
 * Days between two ISO date strings.
 */
function daysBetween(a: string, b: string): number {
  if (!a || !b) return 9999;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return 9999;
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

/**
 * Match reconstructed ETL invoices against Supabase invoices.
 *
 * Uses a multi-pass approach to prevent wrong-month matches from stealing
 * correct same-month matches:
 *
 *   Pass 1: EXACT amount (< $0.05) + same month → lock these first
 *   Pass 2: EXACT amount (< $0.05) + any month (closest date wins)
 *   Pass 3: CLOSE amount (< 2%) + same month only
 *   Pass 4: MONTH_MATCH (< 15%) + same month only
 *
 * CLOSE and MONTH matches require same billing month to prevent
 * false positives from similar amounts across different periods.
 *
 * Each Supabase invoice is matched at most once. Within each pass,
 * matches are scored by date proximity to break ties.
 */
export function matchInvoices(
  etlInvoices: ETLInvoice[],
  supabaseInvoices: SupabaseInvoice[]
): MatchResult[] {
  // Index Supabase invoices by vendor
  const byVendor = new Map<string, SupabaseInvoice[]>();
  for (const inv of supabaseInvoices) {
    if (!byVendor.has(inv.vendor_name)) byVendor.set(inv.vendor_name, []);
    byVendor.get(inv.vendor_name)!.push(inv);
  }

  const usedSupabase = new Set<string>();
  const resultMap = new Map<string, MatchResult>(); // keyed by ETL groupKey

  // Helper: get ETL amount for comparison
  function etlAmount(etl: ETLInvoice): number {
    return etl.computedAmount !== etl.rawAmount ? etl.computedAmount : etl.rawAmount;
  }

  // Helper: get billing month as YYYY-MM
  function month(dateStr: string): string {
    return dateStr ? dateStr.substring(0, 7) : '';
  }

  // ─── Pass 1: EXACT amount + same month ─────────────────────────────
  for (const etl of etlInvoices) {
    if (resultMap.has(etl.groupKey)) continue;
    const candidates = byVendor.get(etl.supabaseVendor) || [];
    const amt = etlAmount(etl);
    const etlMo = month(etl.billingMonth);

    let best: SupabaseInvoice | null = null;
    let bestDist = Infinity;

    for (const sub of candidates) {
      if (usedSupabase.has(sub.id)) continue;
      const diff = Math.abs(amt - sub.total_amount);
      if (diff >= 0.05) continue;
      if (month(sub.invoice_date) !== etlMo) continue;

      const dist = daysBetween(etl.billingMonth, sub.invoice_date);
      if (dist < bestDist) {
        best = sub;
        bestDist = dist;
      }
    }

    if (best) {
      usedSupabase.add(best.id);
      resultMap.set(etl.groupKey, {
        etlInvoice: etl,
        supabaseInvoice: best,
        matchType: 'EXACT',
        amountDiff: Math.round((amt - best.total_amount) * 100) / 100,
      });
    }
  }

  // ─── Pass 2: EXACT amount + any month ──────────────────────────────
  for (const etl of etlInvoices) {
    if (resultMap.has(etl.groupKey)) continue;
    const candidates = byVendor.get(etl.supabaseVendor) || [];
    const amt = etlAmount(etl);

    let best: SupabaseInvoice | null = null;
    let bestDist = Infinity;

    for (const sub of candidates) {
      if (usedSupabase.has(sub.id)) continue;
      const diff = Math.abs(amt - sub.total_amount);
      if (diff >= 0.05) continue;

      const dist = daysBetween(etl.billingMonth, sub.invoice_date);
      if (dist < bestDist) {
        best = sub;
        bestDist = dist;
      }
    }

    if (best) {
      usedSupabase.add(best.id);
      resultMap.set(etl.groupKey, {
        etlInvoice: etl,
        supabaseInvoice: best,
        matchType: 'EXACT',
        amountDiff: Math.round((amt - best.total_amount) * 100) / 100,
      });
    }
  }

  // ─── Pass 3: CLOSE amount (< 2%) + same month ─────────────────────
  for (const etl of etlInvoices) {
    if (resultMap.has(etl.groupKey)) continue;
    const candidates = byVendor.get(etl.supabaseVendor) || [];
    const amt = etlAmount(etl);
    const etlMo = month(etl.billingMonth);

    let best: SupabaseInvoice | null = null;
    let bestDist = Infinity;

    for (const sub of candidates) {
      if (usedSupabase.has(sub.id)) continue;
      const diff = Math.abs(amt - sub.total_amount);
      const pctDiff = sub.total_amount !== 0 ? diff / Math.abs(sub.total_amount) : (diff === 0 ? 0 : 1);
      if (pctDiff >= 0.02) continue;
      if (month(sub.invoice_date) !== etlMo) continue;

      const dist = daysBetween(etl.billingMonth, sub.invoice_date);
      if (dist < bestDist) {
        best = sub;
        bestDist = dist;
      }
    }

    if (best) {
      usedSupabase.add(best.id);
      resultMap.set(etl.groupKey, {
        etlInvoice: etl,
        supabaseInvoice: best,
        matchType: 'CLOSE',
        amountDiff: Math.round((amt - best.total_amount) * 100) / 100,
      });
    }
  }

  // Pass 4 removed: CLOSE cross-month matches produced false positives
  // (e.g., similar WINTERWINDS amounts across months). Only EXACT amounts
  // are reliable enough for cross-month matching.

  // ─── Pass 4: MONTH_MATCH (< 15%) + same month ─────────────────────
  for (const etl of etlInvoices) {
    if (resultMap.has(etl.groupKey)) continue;
    const candidates = byVendor.get(etl.supabaseVendor) || [];
    const amt = etlAmount(etl);
    const etlMo = month(etl.billingMonth);

    let best: SupabaseInvoice | null = null;
    let bestDiff = Infinity;

    for (const sub of candidates) {
      if (usedSupabase.has(sub.id)) continue;
      const diff = Math.abs(amt - sub.total_amount);
      const pctDiff = sub.total_amount !== 0 ? diff / Math.abs(sub.total_amount) : (diff === 0 ? 0 : 1);
      if (pctDiff >= 0.15) continue;
      if (month(sub.invoice_date) !== etlMo) continue;

      if (diff < bestDiff) {
        best = sub;
        bestDiff = diff;
      }
    }

    if (best) {
      usedSupabase.add(best.id);
      resultMap.set(etl.groupKey, {
        etlInvoice: etl,
        supabaseInvoice: best,
        matchType: 'MONTH_MATCH',
        amountDiff: Math.round((amt - best.total_amount) * 100) / 100,
      });
    }
  }

  // ─── Build final results (unmatched ETL invoices get NONE) ─────────
  const results: MatchResult[] = [];
  for (const etl of etlInvoices) {
    const match = resultMap.get(etl.groupKey);
    if (match) {
      results.push(match);
    } else {
      results.push({
        etlInvoice: etl,
        supabaseInvoice: null,
        matchType: 'NONE',
        amountDiff: etlAmount(etl),
      });
    }
  }

  return results;
}
