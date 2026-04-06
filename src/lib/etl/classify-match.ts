import type { MatchedItem, NeedsReviewItem, ReviewReason, ETLOverride, VendorProfile } from './types';

/**
 * Classify matched invoices into "confirmed" (no action needed) vs "needs review" (actionable).
 *
 * Confirmed = one of:
 *   - EXACT match + same billing month + previously SAP-imported (SAP- prefix or imported override)
 *   - Any match with override import_action='CONFIRM' + importedAt set
 * Everything else = needs review with specific reasons.
 */
export function classifyAllMatches(
  matched: MatchedItem[],
  overrides: Record<string, ETLOverride>,
  vendorProfiles?: Record<string, VendorProfile>
): { confirmed: MatchedItem[]; needsReview: NeedsReviewItem[] } {
  const confirmed: MatchedItem[] = [];
  const needsReview: NeedsReviewItem[] = [];

  for (const item of matched) {
    const override = overrides[item.etl.groupKey];

    // User explicitly confirmed this item — treat as Confirmed
    if (override?.importAction === 'CONFIRM' && override.importedAt) {
      confirmed.push(item);
      continue;
    }

    const reasons = getReviewReasons(item, override);
    if (reasons.length === 0) {
      confirmed.push(item);
    } else {
      const suggestion = vendorProfiles
        ? getSuggestion(item, reasons, vendorProfiles[item.etl.supabaseVendor])
        : undefined;
      needsReview.push({ ...item, reviewReasons: reasons, suggestion });
    }
  }

  // Post-pass: detect suspect pairings (fixed vendor + large month gap + DB month already covered)
  if (vendorProfiles) {
    detectSuspectPairings(needsReview, confirmed, vendorProfiles);
  }

  return { confirmed, needsReview };
}

function getReviewReasons(item: MatchedItem, override?: ETLOverride): ReviewReason[] {
  const reasons: ReviewReason[] = [];

  // Non-exact matches always need review
  if (item.matchType === 'MONTHLY_TOTAL') {
    reasons.push('MONTHLY_TOTAL');
    reasons.push('AMOUNT_DIFF');
    return reasons;
  }

  if (item.matchType === 'CLOSE' || item.matchType === 'MONTH_MATCH') {
    reasons.push('AMOUNT_DIFF');
    return reasons;
  }

  // EXACT match — check billing month alignment
  const etlMonth = item.etl.billingMonth.substring(0, 7);  // YYYY-MM
  const dbMonth = item.supabase.invoice_date.substring(0, 7);
  if (etlMonth !== dbMonth) {
    reasons.push('MONTH_MISMATCH');
  }

  // EXACT + same month — check if previously SAP-imported
  const hasSapPrefix = item.supabase.invoice_number?.startsWith('SAP-');
  const wasImported = !!override?.importedAt;
  if (!hasSapPrefix && !wasImported && reasons.length === 0) {
    reasons.push('NO_SAP_HISTORY');
  }

  return reasons;
}

/**
 * Detect suspect pairings: fixed-amount vendor matched across months where
 * the DB month is already covered by another match (confirmed or needs-review).
 * E.g., Dropbox $300/mo March SAP matched to December DB — but Jan/Feb already matched.
 */
function detectSuspectPairings(
  needsReview: NeedsReviewItem[],
  confirmed: MatchedItem[],
  vendorProfiles: Record<string, VendorProfile>
): void {
  // Build a map of which DB months are already covered per vendor (from confirmed + other reviews)
  const allMatched = [...confirmed, ...needsReview];
  const coveredDbMonths = new Map<string, Set<string>>(); // vendor -> set of DB months
  for (const item of allMatched) {
    const v = item.etl.supabaseVendor;
    if (!coveredDbMonths.has(v)) coveredDbMonths.set(v, new Set());
    coveredDbMonths.get(v)!.add(item.supabase.invoice_date.substring(0, 7));
  }

  for (const item of needsReview) {
    if (!item.reviewReasons.includes('MONTH_MISMATCH')) continue;

    const vendor = item.etl.supabaseVendor;
    const profile = vendorProfiles[vendor];
    if (!profile) continue;

    const etlMonth = item.etl.billingMonth.substring(0, 7);
    const dbMonth = item.supabase.invoice_date.substring(0, 7);
    const gap = monthsBetween(dbMonth, etlMonth);

    // Flag if: gap >= 2 AND the SAP month doesn't have a same-month DB match already
    // (meaning the SAP entry grabbed a wrong-month DB invoice because the right one doesn't exist)
    if (gap >= 2) {
      const dbMonths = coveredDbMonths.get(vendor) || new Set();
      const sapMonthHasDbMatch = dbMonths.has(etlMonth);

      if (!sapMonthHasDbMatch) {
        if (!item.reviewReasons.includes('SUSPECT_PAIRING')) {
          item.reviewReasons.push('SUSPECT_PAIRING');
        }
        item.suggestion = `${gap}-month gap. No DB invoice exists for ${formatMonth(etlMonth + '-01')} \u2014 this SAP charge may need a new DB record instead of updating ${formatMonth(dbMonth + '-01')}.`;
      }
    }
  }
}

/**
 * Generate a smart suggestion based on vendor profile and match context.
 */
function getSuggestion(
  item: MatchedItem,
  reasons: ReviewReason[],
  profile?: VendorProfile
): string | undefined {
  // MONTH_MISMATCH suggestions
  if (reasons.includes('MONTH_MISMATCH')) {
    const etlMonth = item.etl.billingMonth.substring(0, 7);
    const dbMonth = item.supabase.invoice_date.substring(0, 7);
    const monthDiff = monthsBetween(dbMonth, etlMonth);

    if (profile?.isFixedAmount) {
      // Fixed-amount vendor — posting lag is common
      if (monthDiff === 1) {
        return `Fixed ${formatCurrency(profile.typicalAmount!)}/mo vendor. Likely payment lag \u2014 confirm to keep DB date.`;
      } else {
        return `Fixed ${formatCurrency(profile.typicalAmount!)}/mo vendor. ${monthDiff}-month gap \u2014 verify service period.`;
      }
    } else if (profile && profile.invoiceCount === 1) {
      // Single-invoice vendor — insufficient history
      return `First SAP match for this vendor \u2014 verify billing month aligns with service period.`;
    } else if (profile && !profile.isFixedAmount) {
      // Variable vendor — month mismatch is more suspicious
      if (monthDiff === 1) {
        return `Variable-amount vendor. Verify this is payment lag and not a different month\u2019s charge.`;
      } else {
        return `Variable-amount vendor. ${monthDiff}-month gap \u2014 likely wrong pairing. Verify service period.`;
      }
    }
  }

  // NO_SAP_HISTORY — exact match, just not linked
  if (reasons.includes('NO_SAP_HISTORY')) {
    return 'Exact match to DB record. Confirm to link with SAP data.';
  }

  // AMOUNT_DIFF — small vs large
  if (reasons.includes('AMOUNT_DIFF')) {
    const pctDiff = Math.abs(item.amountDiff) / Math.abs(item.supabase.total_amount);
    if (pctDiff < 0.02) {
      return `Small variance (${formatCurrency(Math.abs(item.amountDiff))}). May include tax or rounding.`;
    } else if (pctDiff < 0.05) {
      return 'Moderate variance. Check for tax, fees, or partial adjustments.';
    } else {
      return 'Significant variance. Verify service scope or billing changes.';
    }
  }

  return undefined;
}

/**
 * Format a review reason into a human-readable string for display.
 */
export function formatReviewReason(reason: ReviewReason, item: MatchedItem): string {
  const fmt = (n: number) => formatCurrency(n);

  switch (reason) {
    case 'AMOUNT_DIFF': {
      const dbAmt = item.supabase.total_amount;
      const sapAmt = item.etl.computedAmount || item.etl.rawAmount;
      const diff = sapAmt - dbAmt;
      const sign = diff >= 0 ? '+' : '';
      return `DB ${fmt(dbAmt)} vs SAP ${fmt(sapAmt)} (${sign}${fmt(diff)})`;
    }
    case 'MONTH_MISMATCH': {
      const etlMonth = formatMonth(item.etl.billingMonth);
      const dbMonth = formatMonth(item.supabase.invoice_date);
      return `DB: ${dbMonth} \u2192 SAP: ${etlMonth}`;
    }
    case 'NO_SAP_HISTORY':
      return 'Manual entry \u2014 no SAP import history';
    case 'MONTHLY_TOTAL': {
      const count = item.supabaseGroup?.length ?? 0;
      return `1 SAP charge covers ${count} DB invoices`;
    }
    case 'SUSPECT_PAIRING':
      return 'Possible wrong pairing \u2014 large month gap';
  }
}

function formatMonth(dateStr: string): string {
  const [y, m] = dateStr.substring(0, 7).split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return Math.abs((by * 12 + bm) - (ay * 12 + am));
}
