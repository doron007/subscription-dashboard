// ─── Invoice Reconstruction ─────────────────────────────────────────────────

import type { ClassifiedRow, ETLInvoice } from './types';
import { deriveBillingMonth } from './classify';

/**
 * Reconstruct invoices from classified SAP GL rows.
 * Groups rows by vendor and applies vendor-specific reconstruction strategies.
 * Filters out $0 amount invoices.
 */
export function reconstructInvoices(rows: ClassifiedRow[]): ETLInvoice[] {
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
      // NAVIGATOR: Group by date, merge 12% + 80% splits -> compute full amount
      invoices.push(...reconstructNavigator(vRows, supabaseVendor));
    } else if (sapVendor === 'PINNACLE BUSINESS SYSTEMS INC') {
      // PINNACLE: Group by date, merge DWE 72% + SEF 20% splits -> compute full
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

/**
 * Navigator: Group by posting date + service description base (one invoice per service per date).
 * SAP OData emits three allocation rows per invoice: 12% (Navigator), 80% (SEF inter-company),
 * and 8% (OpCo). The 8% row started flowing through OData around April 2026; when present,
 * rawSum across the three rows equals the full invoice. For older periods where OData only
 * emits 12% + 80% (= 92% of total), the 8% portion is synthesized as a fallback so the
 * reconstructed total still matches the historical DB invoices.
 */
export function reconstructNavigator(rows: ClassifiedRow[], supabaseVendor: string): ETLInvoice[] {
  const groups = new Map<string, ClassifiedRow[]>();
  for (const row of rows) {
    const descBase = row.description.replace(/\s*-\s*(12|80|8)%\s*$/, '').trim();
    const key = `${row.postingDate}|${descBase}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return Array.from(groups.entries()).map(([key, group]) => {
    const rawSum = group.reduce((s, r) => s + r.debitAmount - r.creditAmount, 0);

    const pct12 = group.filter(r => r.description.includes('12%'));
    const pct80 = group.filter(r => r.description.includes('80%'));
    const pct8 = group.filter(r => / - 8%\s*$/.test(r.description));

    let computedAmount = rawSum;
    let note = '';

    if (pct12.length > 0 && pct80.length > 0 && pct8.length === 0) {
      // Legacy fallback: OData is missing the 8% (OpCo) row for this period.
      // Compute full from 12% allocation, synthesize 8% line so totals match DB.
      const amt12 = pct12.reduce((s, r) => s + r.debitAmount, 0);
      const amt80 = pct80.reduce((s, r) => s + r.debitAmount, 0);
      computedAmount = amt12 / 0.12;
      const amt8 = Math.round((computedAmount * 0.08) * 100) / 100;

      const descBase = group[0].description.replace(/\s*-\s*(12|80|8)%\s*$/, '').trim();
      group.push({
        ...group[0],
        description: `${descBase} - 8%`,
        debitAmount: amt8,
        creditAmount: 0,
      });

      note = `12%=${amt12.toFixed(2)} + 80%=${amt80.toFixed(2)} + 8%=${amt8.toFixed(2)} (synth) → full=${computedAmount.toFixed(2)}`;
    } else if (pct12.length > 0 || pct80.length > 0 || pct8.length > 0) {
      const amt12 = pct12.reduce((s, r) => s + r.debitAmount, 0);
      const amt80 = pct80.reduce((s, r) => s + r.debitAmount, 0);
      const amt8 = pct8.reduce((s, r) => s + r.debitAmount, 0);
      note = `12%=${amt12.toFixed(2)} + 80%=${amt80.toFixed(2)} + 8%=${amt8.toFixed(2)} → full=${rawSum.toFixed(2)}`;
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

/**
 * Pinnacle: Group by posting date; each date has DWE 72% + SEF 20% = 92% of total.
 */
export function reconstructPinnacle(rows: ClassifiedRow[], supabaseVendor: string): ETLInvoice[] {
  // Group by posting date AND billing month (rows on the same date can span multiple months)
  const groups = new Map<string, ClassifiedRow[]>();
  for (const row of rows) {
    const bm = deriveBillingMonth(row);
    const key = `${row.postingDate}|${bm}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return Array.from(groups.entries()).map(([key, group]) => {
    const rawSum = group.reduce((s, r) => s + r.debitAmount - r.creditAmount, 0);
    const billingMonth = deriveBillingMonth(group[0]);
    const postingDate = group[0].postingDate;

    // DWE 72% + SEF 20% = 92% of total invoice
    const dwe = group.filter(r => r.description.includes('DWE'));
    const sef = group.filter(r => r.description.includes('SEF'));
    let computedAmount = rawSum;
    let note = '';

    if (dwe.length > 0 && sef.length > 0) {
      const dweAmt = dwe.reduce((s, r) => s + r.debitAmount, 0);
      computedAmount = Math.round((dweAmt / 0.72) * 100) / 100;
      const sefAmt = sef.reduce((s, r) => s + r.debitAmount, 0);
      note = `DWE72%=${dweAmt.toFixed(2)} + SEF20%=${sefAmt.toFixed(2)} → full=${computedAmount.toFixed(2)}`;
    }

    return {
      sapVendor: 'PINNACLE BUSINESS SYSTEMS INC',
      supabaseVendor,
      groupKey: `PINNACLE|${key}`,
      postingDate,
      billingMonth,
      rawAmount: Math.round(rawSum * 100) / 100,
      computedAmount,
      allocationNote: note,
      lineItems: group,
    };
  });
}

/**
 * Group by (Business Partner, Offset Doc ID). Falls back to posting date if no offset doc.
 */
export function reconstructByOffsetDoc(rows: ClassifiedRow[], supabaseVendor: string): ETLInvoice[] {
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

/**
 * Group by (Business Partner, Posting Date).
 */
export function reconstructByDate(rows: ClassifiedRow[], supabaseVendor: string): ETLInvoice[] {
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

/**
 * Credit card charges: each row = one invoice.
 */
export function reconstructCCCharges(rows: ClassifiedRow[], supabaseVendor: string): ETLInvoice[] {
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

/**
 * Synergy: Extract PO number from description, group by PO.
 */
export function reconstructSynergy(rows: ClassifiedRow[], supabaseVendor: string): ETLInvoice[] {
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
