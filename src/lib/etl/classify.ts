// ─── Row Classification ─────────────────────────────────────────────────────

import type { SAPRow, ClassifiedRow, RowClassification } from './types';
import { getBillingMonth } from './parsers';
import { BP_TO_SUPABASE, matchSBVendor, matchDescVendor } from './vendors';

/**
 * Classify SAP GL rows by type (vendor debit/credit, CC subscription, payroll, etc.)
 * and attempt to map each to a Supabase vendor name.
 */
export function classifyRows(rows: SAPRow[]): ClassifiedRow[] {
  return rows.map(row => {
    const bp = row.businessPartner;
    const desc = row.description;
    let classification: RowClassification = 'OTHER';
    let supabaseVendor: string | null = null;

    if (bp !== 'Not assigned' && bp !== 'Not Assigned') {
      // Assigned Business Partner
      supabaseVendor = BP_TO_SUPABASE[bp] || null;

      if (row.creditAmount > 0 && row.debitAmount === 0) {
        classification = 'VENDOR_CREDIT';
      } else if (row.debitAmount > 0) {
        classification = 'VENDOR_DEBIT';
      } else {
        classification = 'OTHER';
      }
    } else {
      // Not assigned - check patterns
      // CC charge patterns: SB-MMDD-, MD-MMDD-, DH-MMDD-, BG-MMDD-, etc.
      const ccPrefixMatch = desc.match(/^([A-Z]{2,3})-(\d{4})-(.+)$/i);
      if (ccPrefixMatch) {
        const [, prefix, , vendorPart] = ccPrefixMatch;
        const upperPrefix = prefix.toUpperCase();
        const merchantName = vendorPart.trim();
        supabaseVendor = matchSBVendor(merchantName);

        // MD = IT card (card 4204, Matt Drummond): include by default
        // SB = legacy IT card prefix: include by default
        // All other prefixes (DH, BG, TH, TG, MW) = personal cards:
        //   include ONLY if merchant matches a known Supabase vendor
        if (upperPrefix === 'MD' || upperPrefix === 'SB') {
          classification = supabaseVendor ? 'CC_SUBSCRIPTION' : 'CC_EXPENSE';
        } else {
          // Personal card: only include if vendor matched
          classification = supabaseVendor ? 'CC_SUBSCRIPTION' : 'CC_EXPENSE';
          if (!supabaseVendor) {
            // Personal expense, no vendor match → exclude
            classification = 'CC_EXPENSE';
          }
        }
      } else if (/^(\d{1,2}\.\d{2}\s+)?(Ern|Tax)\s*-/i.test(desc) || /Payroll/i.test(desc)) {
        classification = 'PAYROLL';
      } else if (/Accrual/i.test(desc)) {
        // Accrual rows with vendor names are accounting entries, not real invoices.
        // Classify as ACCRUAL regardless of vendor match (they are reversals/adjustments).
        classification = 'ACCRUAL';
      } else if (/401K|Vacation|PTO/i.test(desc)) {
        classification = 'PAYROLL';
      } else {
        // Check if vendor name appears in description
        const vendorMatch = matchDescVendor(desc);
        if (vendorMatch) {
          // "Not assigned" rows where description is ONLY a vendor name (no service detail)
          // are accrual journal entries (debit = book accrual, credit = reverse it).
          // Real vendor-in-desc rows have extra detail (PO numbers, dates, service names).
          const hasDetail = /PO\s*\d+|Sub\s*\(|\d{1,2}\/\d{2}|Analytics|hours|dev/i.test(desc);
          if (hasDetail) {
            supabaseVendor = vendorMatch;
            classification = 'VENDOR_IN_DESC';
          } else {
            classification = 'ACCRUAL';
          }
        } else if (/^[A-Z]{2,3}-\d{4}-/i.test(desc)) {
          // Employee expense pattern like BA-0901-, TH-1202-
          classification = 'CC_EXPENSE';
        }
      }
    }

    return { ...row, classification, supabaseVendor };
  });
}

/**
 * Derive the billing month from SAP row context (description patterns, SB- prefix, etc.).
 * Returns an ISO first-of-month string like "2025-01-01".
 */
export function deriveBillingMonth(row: ClassifiedRow): string {
  const desc = row.description;

  // Pattern 1: Date ranges in description like "11/16 - 12/01"
  const dateRangeMatch = desc.match(/(\d{1,2})\/(\d{1,2})\s*[-\u2013]\s*(\d{1,2})\/(\d{1,2})/);
  if (dateRangeMatch) {
    const [, m1] = dateRangeMatch;
    const postingYear = parseInt(row.postingDate.substring(0, 4)) || 2025;
    const postingMonth = parseInt(row.postingDate.substring(5, 7)) || 1;
    const serviceMonth = parseInt(m1);
    // Fix year-crossover: if service month is far ahead of posting month,
    // the service was in the prior year (e.g., Nov service posted in Jan)
    const year = (serviceMonth > postingMonth + 2) ? postingYear - 1 : postingYear;
    return `${year}-${m1.padStart(2, '0')}-01`;
  }

  // Pattern 2: Month name in description like "NOV2024", "JAN2025", "DEC2024"
  const monthNameMatch = desc.match(/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*(\d{4})/i);
  if (monthNameMatch) {
    const monthMap: Record<string, string> = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
    };
    const m = monthMap[monthNameMatch[1].toUpperCase()];
    const y = monthNameMatch[2];
    return `${y}-${m}-01`;
  }

  // Pattern 3: CC prefix date like "SB-0101-", "MD-0226-" -> extract month
  const ccDateMatch = desc.match(/^[A-Z]{2,3}-(\d{2})(\d{2})-/i);
  if (ccDateMatch) {
    const [, month] = ccDateMatch;
    const monthNum = parseInt(month);
    if (monthNum >= 1 && monthNum <= 12) {
      const year = row.postingDate.substring(0, 4) || '2026';
      return `${year}-${month}-01`;
    }
  }

  // Pattern 4: Period in parentheses like "(1/25-3/25)" or "(4/25-6/25)"
  const periodMatch = desc.match(/\((\d{1,2})\/(\d{2})-(\d{1,2})\/(\d{2})\)/);
  if (periodMatch) {
    const [, m1, y1] = periodMatch;
    const year = parseInt(y1) >= 50 ? `19${y1}` : `20${y1}`;
    return `${year}-${m1.padStart(2, '0')}-01`;
  }

  // Pattern 5: Date range with years like "01/18 to 02/18/25" or "01/04/25-02/03/25"
  const fullDateMatch = desc.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:to|thru|[-\u2013])\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i);
  if (fullDateMatch) {
    const [, m1, , y1] = fullDateMatch;
    let year = y1 || row.postingDate.substring(0, 4);
    if (year && year.length === 2) {
      year = parseInt(year) >= 50 ? `19${year}` : `20${year}`;
    }
    return `${year}-${m1.padStart(2, '0')}-01`;
  }

  // Pattern 6: "8/25-10/25" format (Viviota Analytics)
  const shortPeriodMatch = desc.match(/(\d{1,2})\/(\d{2})-(\d{1,2})\/(\d{2})$/);
  if (shortPeriodMatch) {
    const [, m1, y1] = shortPeriodMatch;
    const year = parseInt(y1) >= 50 ? `19${y1}` : `20${y1}`;
    return `${year}-${m1.padStart(2, '0')}-01`;
  }

  // Fallback: posting date's first-of-month
  return getBillingMonth(row.postingDate);
}
