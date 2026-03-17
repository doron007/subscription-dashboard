#!/usr/bin/env npx tsx
/**
 * SAP GL Account → Supabase ETL Comparison
 *
 * Reads the SAP GL Account CSV, classifies rows, reconstructs invoices,
 * matches against Supabase production data (READ-ONLY), and produces
 * an XLSX comparison report.
 *
 * Usage: npx tsx scripts/etl-sap-comparison.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// ─── Types ───────────────────────────────────────────────────────────────────

interface SAPRow {
  postingDate: string;       // ISO date
  businessPartner: string;
  description: string;       // Journal Entry Item Text
  offsetSupplier: string;    // Offset Customer / Supplier ID
  offsetDocId: string;       // Offset Operational Document ID
  operationalDocId: string;  // Operational Document ID
  debitAmount: number;
  creditAmount: number;
  rawRow: Record<string, string>;
}

type RowClassification =
  | 'VENDOR_DEBIT'
  | 'VENDOR_CREDIT'
  | 'CC_SUBSCRIPTION'
  | 'CC_EXPENSE'
  | 'VENDOR_IN_DESC'
  | 'PAYROLL'
  | 'ACCRUAL'
  | 'OTHER';

interface ClassifiedRow extends SAPRow {
  classification: RowClassification;
  supabaseVendor: string | null;
}

interface ETLInvoice {
  sapVendor: string;
  supabaseVendor: string;
  groupKey: string;
  postingDate: string;
  billingMonth: string;
  rawAmount: number;
  computedAmount: number;    // After reversing cost allocations
  allocationNote: string;
  lineItems: ClassifiedRow[];
}

interface SupabaseInvoice {
  id: string;
  vendor_name: string;
  vendor_id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  line_item_count: number;
}

interface MatchResult {
  etlInvoice: ETLInvoice;
  supabaseInvoice: SupabaseInvoice | null;
  matchType: 'EXACT' | 'CLOSE' | 'MONTH_MATCH' | 'NONE';
  amountDiff: number;
}

// ─── SAP Amount Parser ──────────────────────────────────────────────────────

function parseSAPAmount(value: string): number {
  if (!value || typeof value !== 'string') return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  // Remove " USD" suffix and commas
  const cleaned = trimmed.replace(/\s*USD\s*$/i, '').replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseSAPDate(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  // MM/DD/YYYY → YYYY-MM-DD
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, m, d, y] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return trimmed;
}

function getBillingMonth(isoDate: string): string {
  if (!isoDate || isoDate.length < 7) return '';
  return isoDate.substring(0, 7) + '-01';
}

// ─── Vendor Mapping ─────────────────────────────────────────────────────────

// SAP Business Partner → Supabase vendor name
const BP_TO_SUPABASE: Record<string, string> = {
  'WINTERWINDS ROBOTICS INC': 'WINTERWINDS ROBOTICS INC',
  'EQUIPT INNOVATION INC': 'EQUIPT INNOVATION INC',
  'NAVIGATOR BUSINESS SOLUTIONS  INC': 'NAVIGATOR BUSINESS SOLUTIONS  INC',
  'CDW LLC CDW DIRECT LLC': 'CDW LLC CDW DIRECT LLC',
  'N-ABLE TECHNOLOGIES LTD SOLARWINDS MSP HOLDINGS WORLDWIDE LTD': 'N-ABLE TECHNOLOGIES LTD SOLARWINDS MSP HOLDINGS WORLDWIDE LT',
  'PINNACLE BUSINESS SYSTEMS INC': 'Pinnacle Business Systems',
  'SYNERGY DATACOM SUPPLY INC': 'SYNERGY DATACOM SUPPLY INC',
  'TULSACONNECT INTERNET SERVICES': 'TULSACONNECT INTERNET SERVICES',
  'VIVIOTA  INC': 'VIVIOTA  INC',
  'STANDLEY SYSTEMS  LLC': 'STANDLEY SYSTEMS  LLC',
  'NEXTGEN SOFTWARE  INC': 'NEXTGEN SOFTWARE  INC',
  'MCE CONNECTRONICS LLC CONNECTRONICS': 'MCE CONNECTRONICS LLC CONNECTRONICS',
  'RYKDEN TECHNOLOGY SOLUTIONS': 'RYKDEN TECHNOLOGY SOLUTIONS',
  'PORT53 TECHNOLOGIES  INC': 'PORT53 TECHNOLOGIES  INC',
  'VENTI EXCHANGE LLC': 'Venti Exchange',
  'AZENDENT PARTNERS LLC TEAM VENTI': 'Venti Exchange',
};

// SB- credit card description patterns → Supabase vendor
// Maps the vendor part after "SB-MMDD-" to Supabase vendor
const SB_VENDOR_PATTERNS: [RegExp, string][] = [
  [/^AMAZON WEB SERVICES/i, 'Amazon Web Services'],
  [/^ADOBE/i, 'Adobe'],
  [/^Adobe/i, 'Adobe'],
  [/^GOOGLE \*CLOUD/i, 'Google Cloud'],
  [/^GOOGLE CLOUD/i, 'Google Cloud'],
  [/^STARLINK/i, 'Starlink'],
  [/^GOTOCOM\*LOGMEIN/i, 'LogMeIn'],
  [/^LogMeIn/i, 'LogMeIn'],
  [/^DROPBOX/i, 'Dropbox'],
  [/^DNH\*GODADDY/i, 'GoDaddy'],
  [/^GoDaddy/i, 'GoDaddy'],
  [/^OPENAI/i, 'OpenAI'],
  [/^RINGCENTRAL/i, 'RingCentral'],
  [/^SHOUTEM/i, 'Shoutem.com'],
  [/^Shoutem/i, 'Shoutem.com'],
  [/^YODECK/i, 'Yodeck.com'],
  [/^FS \*TECHSMITH/i, 'Techsmith'],
  [/^FRESHWORKS/i, 'Freshworks Inc'],
  [/^Freshworks/i, 'Freshworks Inc'],
  [/^GOOGLE \*YOUTUBE/i, 'YouTube'],
  [/^GOOGLE YOUTUBE/i, 'YouTube'],
  [/^YouTube/i, 'YouTube'],
  [/^CLAUDE\.AI/i, 'Claude.ai Subscription'],
  [/^SUPABASE/i, 'Supabase'],
  [/^LASTPASS/i, 'LastPass'],
  [/^SNIPE-IT/i, 'Snipe It Grokability'],
  [/^LITERA/i, 'Litera Microsytems'],
  [/^ENVATO/i, 'Envato'],
  [/^LOVABLE/i, 'Lovable'],
  [/^Lovable/i, 'Lovable'],
  [/^PADDLE/i, 'Paddle'],
  [/^P\.SKOOL/i, 'Skool.com'],
  [/^PEPLINK/i, 'Peplink'],
  [/^PELICAN/i, 'Pelican Products Inc'],
  [/^BEST BUY/i, 'Best Buy'],
  [/^MYBESTBUY/i, 'Best Buy'],
  [/^THE HOME DEPOT/i, 'The Home Depot'],
  [/^OFFICE DEPOT/i, 'Office Depot'],
  [/^FEDEX/i, 'FedEx Office'],
  [/^MINDMUP/i, 'OpenAI'],  // Not a match but for tracking
  [/^Realvnc/i, 'Realvnc Limited'],
  // NI Connect is NOT National Instruments - it's a conference/event charge. Removed per Trey's review.
  [/^GOOGLE \*LINKEDIN/i, 'Other'],
  [/^CBI\*DRAFTSIGHT/i, 'Other'],
  [/^WWW\.TEAMVENTI\.COM/i, 'Venti Exchange'],
];

// "Not assigned" description patterns → Supabase vendor (non-SB)
const DESC_VENDOR_PATTERNS: [RegExp, string][] = [
  [/^SYNERGY DATACOM/i, 'SYNERGY DATACOM SUPPLY INC'],
  [/^Viviota/i, 'VIVIOTA  INC'],
  [/Pinnacle Business/i, 'Pinnacle Business Systems'],
  [/DWE Pinnacle/i, 'Pinnacle Business Systems'],
];

function matchSBVendor(descAfterPrefix: string): string | null {
  for (const [pattern, vendor] of SB_VENDOR_PATTERNS) {
    if (pattern.test(descAfterPrefix)) {
      return vendor === 'Other' ? null : vendor;
    }
  }
  return null;
}

function matchDescVendor(desc: string): string | null {
  for (const [pattern, vendor] of DESC_VENDOR_PATTERNS) {
    if (pattern.test(desc)) {
      return vendor;
    }
  }
  return null;
}

// ─── Step 1: Parse SAP CSV ──────────────────────────────────────────────────

function parseCSV(filePath: string): SAPRow[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  // Remove BOM
  const content = raw.replace(/^\uFEFF/, '');

  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
  });

  return (result.data as Record<string, string>[]).map(row => ({
    postingDate: parseSAPDate(row['Posting Date'] || ''),
    businessPartner: (row['Business Partner'] || '').trim(),
    description: (row['Journal Entry Item Text'] || '').trim(),
    offsetSupplier: (row['Offset Customer / Supplier ID'] || '').trim(),
    offsetDocId: (row['Offset Operational Document ID'] || '').trim(),
    operationalDocId: (row['Operational Document ID'] || '').trim(),
    debitAmount: parseSAPAmount(row['Debit Amount Company Currency'] || ''),
    creditAmount: parseSAPAmount(row['Credit Amount Company Currency'] || ''),
    rawRow: row,
  }));
}

// ─── Step 2: Classify Rows ──────────────────────────────────────────────────

function classifyRows(rows: SAPRow[]): ClassifiedRow[] {
  return rows.map(row => {
    const bp = row.businessPartner;
    const desc = row.description;
    let classification: RowClassification = 'OTHER';
    let supabaseVendor: string | null = null;

    if (bp !== 'Not assigned') {
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
      if (desc.startsWith('SB-')) {
        // Credit card charge: SB-MMDD-VendorName
        const parts = desc.split('-', 3);
        if (parts.length >= 3) {
          const vendorPart = parts.slice(2).join('-').trim();
          supabaseVendor = matchSBVendor(vendorPart);
        }
        classification = supabaseVendor ? 'CC_SUBSCRIPTION' : 'CC_EXPENSE';
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

// ─── Step 3: Derive Billing Month from SAP Context ─────────────────────────

function deriveBillingMonth(row: ClassifiedRow): string {
  const desc = row.description;

  // Pattern 1: Date ranges in description like "11/16 - 12/01"
  const dateRangeMatch = desc.match(/(\d{1,2})\/(\d{1,2})\s*[-–]\s*(\d{1,2})\/(\d{1,2})/);
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

  // Pattern 3: SB- date prefix like "SB-0101-" → Jan
  if (desc.startsWith('SB-')) {
    const sbDateMatch = desc.match(/^SB-(\d{2})(\d{2})-/);
    if (sbDateMatch) {
      const [, month, day] = sbDateMatch;
      const monthNum = parseInt(month);
      // If month > 12, it's MMDD format
      if (monthNum >= 1 && monthNum <= 12) {
        const year = row.postingDate.substring(0, 4) || '2025';
        return `${year}-${month}-01`;
      }
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
  const fullDateMatch = desc.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:to|thru|[-–])\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i);
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

// ─── Step 4: Reconstruct Invoices ───────────────────────────────────────────

function reconstructInvoices(rows: ClassifiedRow[]): ETLInvoice[] {
  // Only process rows that map to a Supabase vendor
  const vendorRows = rows.filter(r => r.supabaseVendor);

  // Group by strategy
  const invoices: ETLInvoice[] = [];

  // Group rows by vendor
  const byVendor = new Map<string, ClassifiedRow[]>();
  for (const row of vendorRows) {
    const vendor = row.supabaseVendor!;
    if (!byVendor.has(vendor)) byVendor.set(vendor, []);
    byVendor.get(vendor)!.push(row);
  }

  for (const [supabaseVendor, vRows] of byVendor) {
    const sapVendor = vRows[0].businessPartner;

    if (sapVendor === 'NAVIGATOR BUSINESS SOLUTIONS  INC') {
      // NAVIGATOR: Group by date, merge 12% + 80% splits → compute full amount
      invoices.push(...reconstructNavigator(vRows, supabaseVendor));
    } else if (sapVendor === 'PINNACLE BUSINESS SYSTEMS INC') {
      // PINNACLE: Group by date, merge DWE 72% + SEF 20% splits → compute full
      invoices.push(...reconstructPinnacle(vRows, supabaseVendor));
    } else if (sapVendor === 'WINTERWINDS ROBOTICS INC' || sapVendor === 'EQUIPT INNOVATION INC') {
      // Group by Offset Doc ID
      invoices.push(...reconstructByOffsetDoc(vRows, supabaseVendor));
    } else if (sapVendor === 'VENTI EXCHANGE LLC' || sapVendor === 'AZENDENT PARTNERS LLC TEAM VENTI') {
      // Venti: group by date
      invoices.push(...reconstructByDate(vRows, supabaseVendor));
    } else if (vRows[0].classification === 'CC_SUBSCRIPTION' || vRows[0].classification === 'CC_EXPENSE') {
      // Credit card charges: each row = one invoice
      invoices.push(...reconstructCCCharges(vRows, supabaseVendor));
    } else if (vRows[0].classification === 'VENDOR_IN_DESC') {
      // Vendor-in-description: various strategies
      if (supabaseVendor === 'SYNERGY DATACOM SUPPLY INC') {
        invoices.push(...reconstructSynergy(vRows, supabaseVendor));
      } else {
        invoices.push(...reconstructByDate(vRows, supabaseVendor));
      }
    } else {
      // Default: group by Offset Doc ID, falling back to date
      const hasOffsetDocs = vRows.some(r => r.offsetDocId !== '#' && r.offsetDocId !== '');
      if (hasOffsetDocs) {
        invoices.push(...reconstructByOffsetDoc(vRows, supabaseVendor));
      } else {
        invoices.push(...reconstructByDate(vRows, supabaseVendor));
      }
    }
  }

  // Filter out $0 amount invoices
  return invoices.filter(inv => Math.abs(inv.rawAmount) >= 0.01 || Math.abs(inv.computedAmount) >= 0.01);
}

function reconstructNavigator(rows: ClassifiedRow[], supabaseVendor: string): ETLInvoice[] {
  // Group by posting date + service description base (one invoice per service per date)
  // Navigator has separate services (ByDesign Managed Services, SAP BYD Software Subs, etc.)
  // each with 12% + 80% allocation splits. Create one invoice per service, not per date.
  const groups = new Map<string, ClassifiedRow[]>();
  for (const row of rows) {
    const descBase = row.description.replace(/\s*-\s*(12|80)%\s*$/, '').trim();
    const key = `${row.postingDate}|${descBase}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return Array.from(groups.entries()).map(([key, group]) => {
    const rawSum = group.reduce((s, r) => s + r.debitAmount - r.creditAmount, 0);
    let computedAmount = rawSum;
    let note = '';

    // Find the 12% and 80% parts
    const pct12 = group.filter(r => r.description.includes('12%'));
    const pct80 = group.filter(r => r.description.includes('80%'));

    if (pct12.length > 0 && pct80.length > 0) {
      const amt12 = pct12.reduce((s, r) => s + r.debitAmount, 0);
      computedAmount = amt12 / 0.12;
      const amt80 = pct80.reduce((s, r) => s + r.debitAmount, 0);
      note = `12%=${amt12.toFixed(2)} + 80%=${amt80.toFixed(2)} → full=${computedAmount.toFixed(2)}`;
    }

    return {
      sapVendor: 'NAVIGATOR BUSINESS SOLUTIONS  INC',
      supabaseVendor,
      groupKey: `NAVIGATOR|${key}`,
      postingDate: group[0].postingDate,
      billingMonth: deriveBillingMonth(group[0]),
      rawAmount: Math.round(rawSum * 100) / 100,
      computedAmount: Math.round(computedAmount * 100) / 100,
      allocationNote: note,
      lineItems: group,
    };
  });
}

function reconstructPinnacle(rows: ClassifiedRow[], supabaseVendor: string): ETLInvoice[] {
  // Group by posting date; each date has DWE 72% + SEF 20% = 92% of total
  const groups = new Map<string, ClassifiedRow[]>();
  for (const row of rows) {
    const key = row.postingDate;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return Array.from(groups.entries()).map(([date, group]) => {
    const rawSum = group.reduce((s, r) => s + r.debitAmount - r.creditAmount, 0);

    // DWE 72% + SEF 20% = 92% of total invoice
    const dwe = group.filter(r => r.description.includes('DWE'));
    const sef = group.filter(r => r.description.includes('SEF'));
    let computedAmount = rawSum;
    let note = '';

    if (dwe.length > 0 && sef.length > 0) {
      // Use DWE amount / 0.72 to compute full
      const dweAmt = dwe.reduce((s, r) => s + r.debitAmount, 0);
      computedAmount = Math.round((dweAmt / 0.72) * 100) / 100;
      const sefAmt = sef.reduce((s, r) => s + r.debitAmount, 0);
      note = `DWE72%=${dweAmt.toFixed(2)} + SEF20%=${sefAmt.toFixed(2)} → full=${computedAmount.toFixed(2)}`;
    }

    return {
      sapVendor: 'PINNACLE BUSINESS SYSTEMS INC',
      supabaseVendor,
      groupKey: `PINNACLE|${date}`,
      postingDate: date,
      billingMonth: deriveBillingMonth(group[0]),
      rawAmount: Math.round(rawSum * 100) / 100,
      computedAmount,
      allocationNote: note,
      lineItems: group,
    };
  });
}

function reconstructByOffsetDoc(rows: ClassifiedRow[], supabaseVendor: string): ETLInvoice[] {
  // Group by (Business Partner, Offset Doc ID)
  const groups = new Map<string, ClassifiedRow[]>();
  for (const row of rows) {
    const docId = row.offsetDocId !== '#' && row.offsetDocId ? row.offsetDocId : row.postingDate;
    const key = `${row.businessPartner}|${docId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return Array.from(groups.entries()).map(([key, group]) => {
    const rawSum = group.reduce((s, r) => s + r.debitAmount - r.creditAmount, 0);
    return {
      sapVendor: group[0].businessPartner,
      supabaseVendor,
      groupKey: key,
      postingDate: group[0].postingDate,
      billingMonth: deriveBillingMonth(group[0]),
      rawAmount: Math.round(rawSum * 100) / 100,
      computedAmount: Math.round(rawSum * 100) / 100,
      allocationNote: '',
      lineItems: group,
    };
  });
}

function reconstructByDate(rows: ClassifiedRow[], supabaseVendor: string): ETLInvoice[] {
  const groups = new Map<string, ClassifiedRow[]>();
  for (const row of rows) {
    const key = `${row.businessPartner}|${row.postingDate}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return Array.from(groups.entries()).map(([key, group]) => {
    const rawSum = group.reduce((s, r) => s + r.debitAmount - r.creditAmount, 0);
    return {
      sapVendor: group[0].businessPartner,
      supabaseVendor,
      groupKey: key,
      postingDate: group[0].postingDate,
      billingMonth: deriveBillingMonth(group[0]),
      rawAmount: Math.round(rawSum * 100) / 100,
      computedAmount: Math.round(rawSum * 100) / 100,
      allocationNote: '',
      lineItems: group,
    };
  });
}

function reconstructCCCharges(rows: ClassifiedRow[], supabaseVendor: string): ETLInvoice[] {
  return rows.map(row => {
    const amount = row.debitAmount > 0 ? row.debitAmount : -row.creditAmount;
    return {
      sapVendor: 'CC:' + row.description.substring(0, 40),
      supabaseVendor,
      groupKey: `CC|${row.postingDate}|${row.description}`,
      postingDate: row.postingDate,
      billingMonth: deriveBillingMonth(row),
      rawAmount: Math.round(amount * 100) / 100,
      computedAmount: Math.round(amount * 100) / 100,
      allocationNote: '',
      lineItems: [row],
    };
  });
}

function reconstructSynergy(rows: ClassifiedRow[], supabaseVendor: string): ETLInvoice[] {
  // Extract PO number from description, group by PO
  const groups = new Map<string, ClassifiedRow[]>();
  for (const row of rows) {
    const poMatch = row.description.match(/PO\s*(\d+)/i);
    const key = poMatch ? `SYNERGY|PO-${poMatch[1]}` : `SYNERGY|${row.postingDate}|${row.description}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return Array.from(groups.entries()).map(([key, group]) => {
    const rawSum = group.reduce((s, r) => s + r.debitAmount - r.creditAmount, 0);
    return {
      sapVendor: 'SYNERGY DATACOM SUPPLY INC (Not assigned)',
      supabaseVendor,
      groupKey: key,
      postingDate: group[0].postingDate,
      billingMonth: deriveBillingMonth(group[0]),
      rawAmount: Math.round(rawSum * 100) / 100,
      computedAmount: Math.round(rawSum * 100) / 100,
      allocationNote: '',
      lineItems: group,
    };
  });
}

// ─── Step 5: Supabase Query (READ-ONLY) ─────────────────────────────────────

async function querySupabase(): Promise<{
  invoices: SupabaseInvoice[];
  vendorTotals: Map<string, { count: number; total: number }>;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials in .env.local');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get all 2025 invoices with vendor names
  const { data: invoiceData, error: invoiceError } = await supabase
    .from('sub_invoices')
    .select(`
      id,
      vendor_id,
      invoice_number,
      invoice_date,
      total_amount,
      sub_vendors!inner(name),
      sub_invoice_line_items(id)
    `)
    .gte('invoice_date', '2025-01-01')
    .lt('invoice_date', '2026-01-01')
    .order('invoice_date');

  if (invoiceError) throw new Error(`Supabase query error: ${invoiceError.message}`);

  const invoices: SupabaseInvoice[] = (invoiceData || []).map((inv: any) => ({
    id: inv.id,
    vendor_name: inv.sub_vendors?.name || 'Unknown',
    vendor_id: inv.vendor_id,
    invoice_number: inv.invoice_number,
    invoice_date: inv.invoice_date,
    total_amount: parseFloat(inv.total_amount) || 0,
    line_item_count: inv.sub_invoice_line_items?.length || 0,
  }));

  // Aggregate vendor totals
  const vendorTotals = new Map<string, { count: number; total: number }>();
  for (const inv of invoices) {
    const entry = vendorTotals.get(inv.vendor_name) || { count: 0, total: 0 };
    entry.count++;
    entry.total += inv.total_amount;
    vendorTotals.set(inv.vendor_name, entry);
  }

  return { invoices, vendorTotals };
}

// ─── Step 6: Match ETL Invoices to Supabase ─────────────────────────────────

function matchInvoices(
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

  // Helper: days between two ISO date strings
  function daysBetween(a: string, b: string): number {
    const da = new Date(a).getTime();
    const db = new Date(b).getTime();
    return Math.abs(da - db) / (1000 * 60 * 60 * 24);
  }

  // Helper: composite score for match quality (lower = better)
  // Combines amount difference with date proximity to break ties
  function matchScore(amtDiff: number, dateDist: number): number {
    return amtDiff + dateDist * 0.01; // date proximity as tiebreaker
  }

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
      const etlMonth = etl.billingMonth.substring(0, 7);
      const subMonth = sub.invoice_date.substring(0, 7);
      if (pctDiff < 0.02 && score < bestScore) {
        bestMatch = sub;
        bestType = 'CLOSE';
        bestScore = score;
        bestDiff = diff;
        continue;
      }

      // Month match: same billing month + reasonable amount (< 15%)
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

// ─── Step 7: Generate XLSX ──────────────────────────────────────────────────

async function generateXLSX(
  classifiedRows: ClassifiedRow[],
  etlInvoices: ETLInvoice[],
  matchResults: MatchResult[],
  supabaseInvoices: SupabaseInvoice[],
  vendorTotals: Map<string, { count: number; total: number }>,
  outputPath: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();

  // Color styles
  const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B4C7E' } };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  const greenFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
  const yellowFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } };
  const redFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } };
  const lightGrayFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };

  function styleHeader(sheet: ExcelJS.Worksheet) {
    const row = sheet.getRow(1);
    row.eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    row.height = 30;
    sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + sheet.columnCount)}1` };
  }

  function currencyFormat(cell: ExcelJS.Cell) {
    cell.numFmt = '#,##0.00';
  }

  // ─── Sheet 1: Summary ─────────────────────────────────────────────────────

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 40 },
    { header: 'Value', key: 'value', width: 25 },
    { header: 'Notes', key: 'notes', width: 50 },
  ];
  styleHeader(summarySheet);

  const totalSAPRows = classifiedRows.length;
  const vendorDebitRows = classifiedRows.filter(r => r.classification === 'VENDOR_DEBIT').length;
  const vendorCreditRows = classifiedRows.filter(r => r.classification === 'VENDOR_CREDIT').length;
  const ccSubRows = classifiedRows.filter(r => r.classification === 'CC_SUBSCRIPTION').length;
  const ccExpRows = classifiedRows.filter(r => r.classification === 'CC_EXPENSE').length;
  const vendorInDescRows = classifiedRows.filter(r => r.classification === 'VENDOR_IN_DESC').length;
  const payrollRows = classifiedRows.filter(r => r.classification === 'PAYROLL').length;
  const accrualRows = classifiedRows.filter(r => r.classification === 'ACCRUAL').length;
  const otherRows = classifiedRows.filter(r => r.classification === 'OTHER').length;

  const mappedVendors = new Set(classifiedRows.filter(r => r.supabaseVendor).map(r => r.supabaseVendor));
  const matchedInvoices = matchResults.filter(r => r.matchType !== 'NONE');
  const exactMatches = matchResults.filter(r => r.matchType === 'EXACT');
  const closeMatches = matchResults.filter(r => r.matchType === 'CLOSE');
  const monthMatches = matchResults.filter(r => r.matchType === 'MONTH_MATCH');
  const unmatchedETL = matchResults.filter(r => r.matchType === 'NONE');

  const etlTotalRaw = etlInvoices.reduce((s, i) => s + i.rawAmount, 0);
  const etlTotalComputed = etlInvoices.reduce((s, i) => s + i.computedAmount, 0);
  const matchedSupabaseTotal = matchResults
    .filter(r => r.supabaseInvoice)
    .reduce((s, r) => s + r.supabaseInvoice!.total_amount, 0);
  const matchedETLTotal = matchResults
    .filter(r => r.supabaseInvoice)
    .reduce((s, r) => s + r.etlInvoice.computedAmount, 0);

  const usedSupabaseIds = new Set(matchResults.filter(r => r.supabaseInvoice).map(r => r.supabaseInvoice!.id));
  const unmatchedSupabase = supabaseInvoices.filter(i => !usedSupabaseIds.has(i.id));

  const summaryData = [
    { metric: '─── SAP GL Data ───', value: '', notes: '' },
    { metric: 'Total SAP GL Rows', value: totalSAPRows, notes: '' },
    { metric: 'Vendor Debit Rows', value: vendorDebitRows, notes: 'Assigned BP with debit' },
    { metric: 'Vendor Credit Rows', value: vendorCreditRows, notes: 'Assigned BP with credit' },
    { metric: 'CC Subscription Rows (SB-)', value: ccSubRows, notes: 'Mapped to Supabase vendor' },
    { metric: 'CC Expense Rows', value: ccExpRows, notes: 'Employee expenses / unmatched CC' },
    { metric: 'Vendor-in-Description Rows', value: vendorInDescRows, notes: 'SYNERGY, Viviota, Pinnacle in Not assigned' },
    { metric: 'Payroll Rows', value: payrollRows, notes: 'Excluded' },
    { metric: 'Accrual Rows', value: accrualRows, notes: 'Excluded' },
    { metric: 'Other Rows', value: otherRows, notes: 'Unclassified' },
    { metric: '', value: '', notes: '' },
    { metric: '─── Vendor Mapping ───', value: '', notes: '' },
    { metric: 'SAP Vendors Mapped to Supabase', value: mappedVendors.size, notes: '' },
    { metric: 'Supabase Vendors (2025)', value: vendorTotals.size, notes: '' },
    { metric: '', value: '', notes: '' },
    { metric: '─── ETL Invoice Reconstruction ───', value: '', notes: '' },
    { metric: 'Reconstructed Invoices', value: etlInvoices.length, notes: '' },
    { metric: 'ETL Total (Raw GL amounts)', value: `$${etlTotalRaw.toFixed(2)}`, notes: '' },
    { metric: 'ETL Total (Computed/reversed)', value: `$${etlTotalComputed.toFixed(2)}`, notes: 'After reversing cost allocations' },
    { metric: '', value: '', notes: '' },
    { metric: '─── Matching Results ───', value: '', notes: '' },
    { metric: 'Exact Matches (< $0.05)', value: exactMatches.length, notes: '' },
    { metric: 'Close Matches (< 2%)', value: closeMatches.length, notes: '' },
    { metric: 'Month Matches (< 15%)', value: monthMatches.length, notes: '' },
    { metric: 'Total Matched', value: matchedInvoices.length, notes: `of ${etlInvoices.length} ETL invoices` },
    { metric: 'Unmatched ETL Invoices', value: unmatchedETL.length, notes: '' },
    { metric: 'Unmatched Supabase Invoices', value: unmatchedSupabase.length, notes: `of ${supabaseInvoices.length} total` },
    { metric: '', value: '', notes: '' },
    { metric: '─── Amount Reconciliation ───', value: '', notes: '' },
    { metric: 'Matched ETL Total (computed)', value: `$${matchedETLTotal.toFixed(2)}`, notes: '' },
    { metric: 'Matched Supabase Total', value: `$${matchedSupabaseTotal.toFixed(2)}`, notes: '' },
    { metric: 'Difference', value: `$${(matchedETLTotal - matchedSupabaseTotal).toFixed(2)}`, notes: '' },
  ];

  for (const row of summaryData) {
    summarySheet.addRow(row);
  }

  // ─── Sheet 2: Vendor Mapping ──────────────────────────────────────────────

  const vendorSheet = workbook.addWorksheet('Vendor Mapping');
  vendorSheet.columns = [
    { header: 'SAP Business Partner', key: 'sapVendor', width: 45 },
    { header: 'Supabase Vendor', key: 'supabaseVendor', width: 45 },
    { header: 'SAP Rows', key: 'sapRows', width: 12 },
    { header: 'SAP Debits', key: 'sapDebits', width: 15 },
    { header: 'SAP Credits', key: 'sapCredits', width: 15 },
    { header: 'SAP Net', key: 'sapNet', width: 15 },
    { header: 'Supabase Invoices', key: 'subInvoices', width: 18 },
    { header: 'Supabase Total', key: 'subTotal', width: 15 },
    { header: 'Match Status', key: 'status', width: 15 },
  ];
  styleHeader(vendorSheet);

  // Aggregate SAP data by mapped vendor
  const sapByVendor = new Map<string, { rows: number; debits: number; credits: number; sapName: string }>();
  for (const row of classifiedRows) {
    if (!row.supabaseVendor) continue;
    const entry = sapByVendor.get(row.supabaseVendor) || { rows: 0, debits: 0, credits: 0, sapName: row.businessPartner };
    entry.rows++;
    entry.debits += row.debitAmount;
    entry.credits += row.creditAmount;
    sapByVendor.set(row.supabaseVendor, entry);
  }

  // All vendors union
  const allVendors = new Set([...sapByVendor.keys(), ...vendorTotals.keys()]);
  for (const vendor of [...allVendors].sort()) {
    const sap = sapByVendor.get(vendor);
    const sub = vendorTotals.get(vendor);

    let status = 'NONE';
    if (sap && sub) status = 'BOTH';
    else if (sap) status = 'SAP ONLY';
    else if (sub) status = 'SUPABASE ONLY';

    const row = vendorSheet.addRow({
      sapVendor: sap?.sapName || '',
      supabaseVendor: vendor,
      sapRows: sap?.rows || 0,
      sapDebits: sap?.debits || 0,
      sapCredits: sap?.credits || 0,
      sapNet: sap ? sap.debits - sap.credits : 0,
      subInvoices: sub?.count || 0,
      subTotal: sub?.total || 0,
      status,
    });

    // Color by status
    if (status === 'BOTH') {
      row.eachCell(c => { c.fill = greenFill; });
    } else if (status === 'SAP ONLY') {
      row.eachCell(c => { c.fill = yellowFill; });
    } else if (status === 'SUPABASE ONLY') {
      row.eachCell(c => { c.fill = redFill; });
    }

    [4, 5, 6, 8].forEach(col => currencyFormat(row.getCell(col)));
  }

  // ─── Sheet 3: Invoice Comparison ──────────────────────────────────────────

  const invoiceSheet = workbook.addWorksheet('Invoice Comparison');
  invoiceSheet.columns = [
    { header: 'Vendor', key: 'vendor', width: 35 },
    { header: 'ETL Posting Date', key: 'etlDate', width: 15 },
    { header: 'ETL Billing Month', key: 'etlMonth', width: 15 },
    { header: 'ETL Raw Amount', key: 'etlRaw', width: 16 },
    { header: 'ETL Computed Amount', key: 'etlComputed', width: 18 },
    { header: 'Allocation Note', key: 'allocNote', width: 45 },
    { header: 'ETL Line Items', key: 'etlLines', width: 14 },
    { header: 'Sub Invoice #', key: 'subInvNum', width: 20 },
    { header: 'Sub Date', key: 'subDate', width: 12 },
    { header: 'Sub Amount', key: 'subAmount', width: 14 },
    { header: 'Sub Lines', key: 'subLines', width: 10 },
    { header: 'Difference', key: 'diff', width: 14 },
    { header: 'Match Type', key: 'matchType', width: 14 },
  ];
  styleHeader(invoiceSheet);

  // Sort by vendor then date
  const sortedResults = [...matchResults].sort((a, b) => {
    const vc = a.etlInvoice.supabaseVendor.localeCompare(b.etlInvoice.supabaseVendor);
    if (vc !== 0) return vc;
    return a.etlInvoice.postingDate.localeCompare(b.etlInvoice.postingDate);
  });

  for (const result of sortedResults) {
    const etl = result.etlInvoice;
    const sub = result.supabaseInvoice;

    const row = invoiceSheet.addRow({
      vendor: etl.supabaseVendor,
      etlDate: etl.postingDate,
      etlMonth: etl.billingMonth,
      etlRaw: etl.rawAmount,
      etlComputed: etl.computedAmount,
      allocNote: etl.allocationNote,
      etlLines: etl.lineItems.length,
      subInvNum: sub?.invoice_number || '',
      subDate: sub?.invoice_date || '',
      subAmount: sub?.total_amount || '',
      subLines: sub?.line_item_count || '',
      diff: result.amountDiff,
      matchType: result.matchType,
    });

    // Color based on match type
    let fill: ExcelJS.Fill | undefined;
    if (result.matchType === 'EXACT') fill = greenFill;
    else if (result.matchType === 'CLOSE' || result.matchType === 'MONTH_MATCH') fill = yellowFill;
    else fill = redFill;

    row.eachCell(c => { c.fill = fill!; });
    [4, 5, 10, 12].forEach(col => currencyFormat(row.getCell(col)));
  }

  // ─── Sheet 4: Line Item Comparison ────────────────────────────────────────

  const lineItemSheet = workbook.addWorksheet('Line Item Detail');
  lineItemSheet.columns = [
    { header: 'Vendor', key: 'vendor', width: 30 },
    { header: 'Posting Date', key: 'date', width: 14 },
    { header: 'SAP Description', key: 'sapDesc', width: 55 },
    { header: 'Classification', key: 'classification', width: 18 },
    { header: 'Debit', key: 'debit', width: 14 },
    { header: 'Credit', key: 'credit', width: 14 },
    { header: 'Net', key: 'net', width: 14 },
    { header: 'Offset Supplier', key: 'offset', width: 35 },
    { header: 'Offset Doc ID', key: 'offsetDoc', width: 18 },
    { header: 'Billing Month', key: 'billingMonth', width: 14 },
    { header: 'Match Type', key: 'matchType', width: 12 },
  ];
  styleHeader(lineItemSheet);

  for (const result of sortedResults) {
    for (const line of result.etlInvoice.lineItems) {
      const row = lineItemSheet.addRow({
        vendor: result.etlInvoice.supabaseVendor,
        date: line.postingDate,
        sapDesc: line.description,
        classification: line.classification,
        debit: line.debitAmount || '',
        credit: line.creditAmount || '',
        net: line.debitAmount - line.creditAmount,
        offset: line.offsetSupplier,
        offsetDoc: line.offsetDocId,
        billingMonth: result.etlInvoice.billingMonth,
        matchType: result.matchType,
      });

      let fill: ExcelJS.Fill | undefined;
      if (result.matchType === 'EXACT') fill = greenFill;
      else if (result.matchType === 'CLOSE' || result.matchType === 'MONTH_MATCH') fill = yellowFill;
      else fill = redFill;
      row.eachCell(c => { c.fill = fill!; });
      [5, 6, 7].forEach(col => currencyFormat(row.getCell(col)));
    }
  }

  // ─── Sheet 5: Unmatched ETL ───────────────────────────────────────────────

  const unmatchedETLSheet = workbook.addWorksheet('Unmatched (ETL)');
  unmatchedETLSheet.columns = [
    { header: 'Vendor', key: 'vendor', width: 35 },
    { header: 'SAP Vendor', key: 'sapVendor', width: 35 },
    { header: 'Posting Date', key: 'date', width: 14 },
    { header: 'Billing Month', key: 'billingMonth', width: 14 },
    { header: 'Raw Amount', key: 'rawAmount', width: 14 },
    { header: 'Computed Amount', key: 'computedAmount', width: 16 },
    { header: 'Allocation Note', key: 'allocNote', width: 45 },
    { header: 'Line Item Descriptions', key: 'descriptions', width: 70 },
  ];
  styleHeader(unmatchedETLSheet);

  for (const result of unmatchedETL) {
    const etl = result.etlInvoice;
    const row = unmatchedETLSheet.addRow({
      vendor: etl.supabaseVendor,
      sapVendor: etl.sapVendor,
      date: etl.postingDate,
      billingMonth: etl.billingMonth,
      rawAmount: etl.rawAmount,
      computedAmount: etl.computedAmount,
      allocNote: etl.allocationNote,
      descriptions: etl.lineItems.map(l => l.description).join(' | '),
    });
    row.eachCell(c => { c.fill = redFill; });
    [5, 6].forEach(col => currencyFormat(row.getCell(col)));
  }

  // ─── Sheet 6: Unmatched Supabase ──────────────────────────────────────────

  const unmatchedSubSheet = workbook.addWorksheet('Unmatched (Supabase)');
  unmatchedSubSheet.columns = [
    { header: 'Vendor', key: 'vendor', width: 40 },
    { header: 'Invoice #', key: 'invoiceNum', width: 25 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Line Items', key: 'lineItems', width: 12 },
    { header: 'Has SAP Counterpart?', key: 'hasSAP', width: 20 },
  ];
  styleHeader(unmatchedSubSheet);

  for (const inv of unmatchedSupabase.sort((a, b) => a.vendor_name.localeCompare(b.vendor_name))) {
    const hasSAP = sapByVendor.has(inv.vendor_name);
    const row = unmatchedSubSheet.addRow({
      vendor: inv.vendor_name,
      invoiceNum: inv.invoice_number,
      date: inv.invoice_date,
      amount: inv.total_amount,
      lineItems: inv.line_item_count,
      hasSAP: hasSAP ? 'Yes - unmatched' : 'No SAP data',
    });
    row.eachCell(c => { c.fill = hasSAP ? yellowFill : lightGrayFill; });
    currencyFormat(row.getCell(4));
  }

  // ─── Sheet 7: Excluded Rows ───────────────────────────────────────────────

  const excludedSheet = workbook.addWorksheet('Excluded Rows');
  excludedSheet.columns = [
    { header: 'Classification', key: 'classification', width: 18 },
    { header: 'Posting Date', key: 'date', width: 14 },
    { header: 'Business Partner', key: 'bp', width: 35 },
    { header: 'Description', key: 'desc', width: 60 },
    { header: 'Debit', key: 'debit', width: 14 },
    { header: 'Credit', key: 'credit', width: 14 },
  ];
  styleHeader(excludedSheet);

  const excludedRows = classifiedRows.filter(r =>
    ['PAYROLL', 'ACCRUAL', 'OTHER', 'CC_EXPENSE'].includes(r.classification) && !r.supabaseVendor
  );

  for (const eRow of excludedRows) {
    const row = excludedSheet.addRow({
      classification: eRow.classification,
      date: eRow.postingDate,
      bp: eRow.businessPartner,
      desc: eRow.description,
      debit: eRow.debitAmount || '',
      credit: eRow.creditAmount || '',
    });
    row.eachCell(c => { c.fill = lightGrayFill; });
    [5, 6].forEach(col => currencyFormat(row.getCell(col)));
  }

  // Freeze top row on all sheets
  workbook.eachSheet(sheet => {
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  });

  await workbook.xlsx.writeFile(outputPath);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('SAP GL → Supabase ETL Comparison');
  console.log('================================\n');

  // Step 1: Parse CSV (accepts optional CLI arg for path)
  const csvArg = process.argv[2];
  const csvPath = csvArg
    ? path.resolve(csvArg)
    : path.resolve(process.env.HOME || '~', 'Desktop', 'GL Account 2025.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  console.log(`Reading SAP CSV from: ${csvPath}`);
  const sapRows = parseCSV(csvPath);
  console.log(`  Parsed ${sapRows.length} rows\n`);

  // Step 2: Classify
  console.log('Classifying rows...');
  const classified = classifyRows(sapRows);
  const classCounts = new Map<string, number>();
  for (const r of classified) {
    classCounts.set(r.classification, (classCounts.get(r.classification) || 0) + 1);
  }
  for (const [cls, count] of [...classCounts.entries()].sort()) {
    console.log(`  ${cls}: ${count}`);
  }
  console.log();

  // Step 3: Reconstruct invoices
  console.log('Reconstructing invoices...');
  const etlInvoices = reconstructInvoices(classified);
  console.log(`  Created ${etlInvoices.length} ETL invoices\n`);

  // Step 4: Query Supabase (READ-ONLY)
  console.log('Querying Supabase (read-only)...');
  const { invoices: supabaseInvoices, vendorTotals } = await querySupabase();
  console.log(`  Found ${supabaseInvoices.length} Supabase invoices from ${vendorTotals.size} vendors\n`);

  // Step 5: Match
  console.log('Matching ETL invoices to Supabase...');
  const matchResults = matchInvoices(etlInvoices, supabaseInvoices);
  const exact = matchResults.filter(r => r.matchType === 'EXACT').length;
  const close = matchResults.filter(r => r.matchType === 'CLOSE').length;
  const month = matchResults.filter(r => r.matchType === 'MONTH_MATCH').length;
  const none = matchResults.filter(r => r.matchType === 'NONE').length;
  console.log(`  EXACT: ${exact}, CLOSE: ${close}, MONTH: ${month}, NONE: ${none}\n`);

  // Step 6: Generate XLSX
  const outputPath = path.resolve(process.env.HOME || '~', 'Desktop', 'SAP-Supabase-Comparison.xlsx');
  console.log(`Generating XLSX: ${outputPath}`);
  await generateXLSX(classified, etlInvoices, matchResults, supabaseInvoices, vendorTotals, outputPath);
  console.log('Done!\n');

  // Print top-level stats
  const matchedTotal = matchResults
    .filter(r => r.supabaseInvoice)
    .reduce((s, r) => s + r.supabaseInvoice!.total_amount, 0);
  const etlMatchedTotal = matchResults
    .filter(r => r.supabaseInvoice)
    .reduce((s, r) => s + r.etlInvoice.computedAmount, 0);

  console.log('=== Reconciliation Summary ===');
  console.log(`ETL invoices: ${etlInvoices.length} → Matched: ${exact + close + month} (${((exact + close + month) / etlInvoices.length * 100).toFixed(1)}%)`);
  console.log(`Matched Supabase total: $${matchedTotal.toFixed(2)}`);
  console.log(`Matched ETL total: $${etlMatchedTotal.toFixed(2)}`);
  console.log(`Difference: $${(etlMatchedTotal - matchedTotal).toFixed(2)}`);
}

main().catch(err => {
  console.error('ETL Error:', err);
  process.exit(1);
});
