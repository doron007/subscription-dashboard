// ─── Invoice Matching ───────────────────────────────────────────────────────

import type { ETLInvoice, SupabaseInvoice, MatchResult } from './types';

/**
 * Days between two ISO date strings.
 */
function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

/**
 * Composite score for match quality (lower = better).
 * Combines amount difference with date proximity to break ties.
 */
function matchScore(amtDiff: number, dateDist: number): number {
  return amtDiff + dateDist * 0.01; // date proximity as tiebreaker
}

/**
 * Match reconstructed ETL invoices against Supabase invoices.
 * Uses greedy best-match with EXACT > CLOSE > MONTH_MATCH tiers.
 * Each Supabase invoice is matched at most once.
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
  const results: MatchResult[] = [];

  for (const etl of etlInvoices) {
    const candidates = byVendor.get(etl.supabaseVendor) || [];
    let bestMatch: SupabaseInvoice | null = null;
    let bestType: MatchResult['matchType'] = 'NONE';
    let bestScore = Infinity;
    let bestDiff = Infinity;

    // Amount to compare: use computedAmount if different from raw
    const etlAmount = etl.computedAmount !== etl.rawAmount ? etl.computedAmount : etl.rawAmount;

    for (const sub of candidates) {
      if (usedSupabase.has(sub.id)) continue;

      const diff = Math.abs(etlAmount - sub.total_amount);
      const pctDiff = sub.total_amount !== 0 ? diff / Math.abs(sub.total_amount) : (diff === 0 ? 0 : 1);
      const dateDist = daysBetween(etl.billingMonth, sub.invoice_date);
      const score = matchScore(diff, dateDist);

      // Exact match: same amount (within $0.05)
      if (diff < 0.05) {
        if (score < bestScore) {
          bestMatch = sub;
          bestType = 'EXACT';
          bestScore = score;
          bestDiff = diff;
        }
        continue;
      }

      // Close match: within 2%
      if (pctDiff < 0.02 && score < bestScore) {
        bestMatch = sub;
        bestType = 'CLOSE';
        bestScore = score;
        bestDiff = diff;
        continue;
      }

      // Month match: same billing month + reasonable amount (< 15%)
      const etlMonth = etl.billingMonth.substring(0, 7);
      const subMonth = sub.invoice_date.substring(0, 7);
      if (etlMonth === subMonth && pctDiff < 0.15 && score < bestScore) {
        bestMatch = sub;
        bestType = 'MONTH_MATCH';
        bestScore = score;
        bestDiff = diff;
      }
    }

    if (bestMatch) {
      usedSupabase.add(bestMatch.id);
    }

    results.push({
      etlInvoice: etl,
      supabaseInvoice: bestMatch,
      matchType: bestType,
      amountDiff: bestMatch ? Math.round((etlAmount - bestMatch.total_amount) * 100) / 100 : etlAmount,
    });
  }

  return results;
}
