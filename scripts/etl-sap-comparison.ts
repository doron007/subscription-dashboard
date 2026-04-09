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

import {
  SAPRow,
  ClassifiedRow,
  ETLInvoice,
  SupabaseInvoice,
  MatchResult,
  parseSAPAmount,
  parseSAPDate,
  classifyRows,
  reconstructInvoices,
  matchInvoices,
} from '../src/lib/etl';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// ─── Step 1: Parse SAP CSV (CLI-specific) ───────────────────────────────────

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
    externalReference: (row['External Reference'] || '').trim(),
    debitAmount: parseSAPAmount(row['Debit Amount Company Currency'] || ''),
    creditAmount: parseSAPAmount(row['Credit Amount Company Currency'] || ''),
    rawRow: row,
  }));
}

// ─── Supabase Query (READ-ONLY) ─────────────────────────────────────────────

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
    lineItems: [],
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

// ─── XLSX Generation ─────────────────────────────────────────────────────────

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
