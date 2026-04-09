// ─── Payment Status Cross-Reference ─────────────────────────────────────────

import type { ETLInvoice, MonitoringInvoice, PaymentStatus } from './types';

/**
 * Map SAP lifecycle status to our PaymentStatus domain.
 */
function mapLifecycleStatus(status: string): PaymentStatus {
  switch (status) {
    case 'Paid': return 'Paid';
    case 'Posted':
    case 'In Approval': return 'Not Paid';
    case 'Canceled':
    case 'Voided': return 'Cancelled';
    default: return 'Unknown';
  }
}

/**
 * Cross-reference ETL invoices with Monitoring Invoices to determine payment status.
 *
 * Two matching paths (validated against real SAP data):
 *   Path A: exact match on (postingDate + externalReference) = (postingDate + externalDocId)
 *   Path B: exact match on offsetDocId = purchaseOrderId (date ignored — GL posts 10-27 days later)
 *
 * For 1:N matches (multiple Q2 rows for one Q1 row), all rows share the same invoice
 * so status is consistent. If conflicting statuses exist, "Not Paid" wins (conservative).
 *
 * Unmatched CC transactions default to "Paid" (per Trey — CC charges are paid at swipe).
 * Unmatched non-CC rows default to "Unknown" and are flagged in warnings.
 */
export function resolvePaymentStatus(
  etlInvoices: ETLInvoice[],
  monitoringInvoices: MonitoringInvoice[]
): { invoices: ETLInvoice[]; warnings: string[] } {
  if (monitoringInvoices.length === 0) {
    // No monitoring data — CC = Paid, everything else = Unknown
    return {
      invoices: etlInvoices.map(inv => ({
        ...inv,
        paymentStatus: isCC(inv) ? 'Paid' : 'Unknown',
      })),
      warnings: [],
    };
  }

  // Build lookup indices for monitoring invoices
  // Path A index: (postingDate|externalDocId) -> MonitoringInvoice[]
  const pathAIndex = new Map<string, MonitoringInvoice[]>();
  // Path B index: purchaseOrderId -> MonitoringInvoice[]
  const pathBIndex = new Map<string, MonitoringInvoice[]>();

  for (const mi of monitoringInvoices) {
    if (mi.externalDocId) {
      const key = `${mi.postingDate}|${mi.externalDocId}`;
      if (!pathAIndex.has(key)) pathAIndex.set(key, []);
      pathAIndex.get(key)!.push(mi);
    }
    if (mi.purchaseOrderId) {
      if (!pathBIndex.has(mi.purchaseOrderId)) pathBIndex.set(mi.purchaseOrderId, []);
      pathBIndex.get(mi.purchaseOrderId)!.push(mi);
    }
  }

  const unmatchedNonCC: string[] = [];
  const results: ETLInvoice[] = [];

  for (const inv of etlInvoices) {
    let matched: MonitoringInvoice | null = null;

    // Check all line items for a match (an ETL invoice may have multiple GL rows)
    for (const row of inv.lineItems) {
      if (matched) break;

      // Path A: postingDate + externalReference
      if (row.externalReference) {
        const key = `${row.postingDate}|${row.externalReference}`;
        const candidates = pathAIndex.get(key);
        if (candidates && candidates.length > 0) {
          matched = candidates[0];
          break;
        }
      }

      // Path B: offsetDocId = purchaseOrderId (date-free — validated 10-27 day lag)
      if (row.offsetDocId && row.offsetDocId !== '#') {
        const candidates = pathBIndex.get(row.offsetDocId);
        if (candidates && candidates.length > 0) {
          matched = candidates[0];
          break;
        }
      }
    }

    let paymentStatus: PaymentStatus;
    if (matched) {
      paymentStatus = mapLifecycleStatus(matched.lifecycleStatus);
    } else if (isCC(inv)) {
      paymentStatus = 'Paid';
    } else {
      paymentStatus = 'Unknown';
      unmatchedNonCC.push(inv.supabaseVendor || inv.sapVendor);
    }

    results.push({ ...inv, paymentStatus });
  }

  // Build warnings for unmatched non-CC vendors
  const warnings: string[] = [];
  if (unmatchedNonCC.length > 0) {
    const vendorCounts = new Map<string, number>();
    for (const v of unmatchedNonCC) {
      vendorCounts.set(v, (vendorCounts.get(v) || 0) + 1);
    }
    const sorted = [...vendorCounts.entries()].sort((a, b) => b[1] - a[1]);
    const summary = sorted.slice(0, 5).map(([v, c]) => `${v} (${c})`).join(', ');
    const more = sorted.length > 5 ? ` and ${sorted.length - 5} more` : '';
    warnings.push(`${unmatchedNonCC.length} non-CC invoice(s) had no payment status match: ${summary}${more}`);
  }

  return { invoices: results, warnings };
}

/**
 * Check if an ETL invoice is a credit card transaction.
 */
function isCC(inv: ETLInvoice): boolean {
  return inv.lineItems.some(row =>
    /^[A-Z]{2,3}-\d{4}-/i.test(row.description)
  );
}
