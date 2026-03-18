#!/usr/bin/env npx tsx
/**
 * SAP GL OData Fetcher
 *
 * Fetches YTD GL data from SAP ByDesign OData, transforms JSON to the same
 * shape as the CSV-based ETL, and saves as JSON for the comparison script.
 *
 * Usage: npx tsx scripts/fetch-sap-odata.ts
 * Output: ~/Desktop/SAP-OData-2026.json (same shape as CSV rows)
 *
 * NO database writes — read-only from SAP and local file output only.
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// ─── Config ─────────────────────────────────────────────────────────────────

const SAP_BASE_URL = process.env.SAP_ODATA_BASE_URL!;
const SAP_USERNAME = process.env.SAP_ODATA_USERNAME!;
const SAP_PASSWORD = process.env.SAP_ODATA_PASSWORD!;

if (!SAP_BASE_URL || !SAP_USERNAME || !SAP_PASSWORD) {
  console.error('Missing SAP OData credentials in .env.local');
  console.error('Required: SAP_ODATA_BASE_URL, SAP_ODATA_USERNAME, SAP_ODATA_PASSWORD');
  process.exit(1);
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface ODataRow {
  CBUS_PART_UUID: string;       // BP code
  CNOTE_IT: string;             // Journal Entry Item Text
  COFF_BUSPARTNER: string;      // Offset BP code
  COFF_OPD_F_ID: string;        // Offset Operational Document ID
  COPDREF_F_ID: string;         // Operational Document ID
  CPOSTING_DATE: string;        // /Date(epoch)/
  FCDEBIT_CURRCOMP: string;     // Formatted debit "1,234.56 USD"
  FCCREDIT_CURRCOMP: string;    // Formatted credit
  KCDEBIT_CURRCOMP: string;     // Raw debit number
  KCCREDIT_CURRCOMP: string;    // Raw credit number
  TBUS_PART_UUID: string;       // BP text name
  TOFF_BUSPARTNER: string;      // Offset BP text name
  [key: string]: string;
}

// CSV-equivalent shape (what the ETL expects)
interface CSVEquivalentRow {
  'Posting Date': string;
  'Business Partner': string;
  'Journal Entry Item Text': string;
  'Offset Customer / Supplier ID': string;
  'Offset Operational Document ID': string;
  'Operational Document ID': string;
  'Debit Amount Company Currency': string;
  'Credit Amount Company Currency': string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseODataDate(odataDate: string): string {
  // /Date(1771200000000)/ → "02/16/2026"
  const match = odataDate.match(/\/Date\((\d+)\)\//);
  if (!match) return '';
  const ms = parseInt(match[1]);
  const dt = new Date(ms);
  const m = (dt.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = dt.getUTCDate().toString().padStart(2, '0');
  const y = dt.getUTCFullYear();
  return `${m}/${d}/${y}`;
}

function normalizeBusinessPartner(bp: string): string {
  // OData returns "Not Assigned" (capitalized); CSV had "Not assigned"
  if (bp === 'Not Assigned') return 'Not assigned';
  return bp;
}

function odataToCSVRow(row: ODataRow): CSVEquivalentRow {
  return {
    'Posting Date': parseODataDate(row.CPOSTING_DATE),
    'Business Partner': normalizeBusinessPartner(row.TBUS_PART_UUID),
    'Journal Entry Item Text': row.CNOTE_IT,
    'Offset Customer / Supplier ID': normalizeBusinessPartner(row.TOFF_BUSPARTNER),
    'Offset Operational Document ID': row.COFF_OPD_F_ID || '#',
    'Operational Document ID': row.COPDREF_F_ID || '#',
    'Debit Amount Company Currency': row.FCDEBIT_CURRCOMP || '',
    'Credit Amount Company Currency': row.FCCREDIT_CURRCOMP || '',
  };
}

// ─── OData Fetch with Pagination ────────────────────────────────────────────

async function fetchAllRows(): Promise<ODataRow[]> {
  const allRows: ODataRow[] = [];
  const pageSize = 500;
  let skip = 0;
  let totalCount = 0;

  const auth = Buffer.from(`${SAP_USERNAME}:${SAP_PASSWORD}`).toString('base64');
  const separator = SAP_BASE_URL.includes('?') ? '&' : '?';

  // First request with inline count
  const firstUrl = `${SAP_BASE_URL}${separator}$inlinecount=allpages&$top=${pageSize}&$skip=${skip}`;
  console.log(`Fetching: ${firstUrl.replace(/\$.*/, '...')}`);

  const firstResp = await fetch(firstUrl, {
    headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
  });

  if (!firstResp.ok) {
    const text = await firstResp.text();
    if (text.includes('loginForm') || text.includes('Logon')) {
      throw new Error('SAP returned login page — authentication failed. Check credentials.');
    }
    throw new Error(`OData error ${firstResp.status}: ${text.substring(0, 200)}`);
  }

  const firstData = await firstResp.json() as { d: { __count: string; results: ODataRow[] } };
  totalCount = parseInt(firstData.d.__count);
  allRows.push(...firstData.d.results);
  console.log(`  Page 1: ${firstData.d.results.length} rows (total: ${totalCount})`);

  // Fetch remaining pages
  skip += pageSize;
  while (skip < totalCount) {
    const url = `${SAP_BASE_URL}${separator}$top=${pageSize}&$skip=${skip}`;
    console.log(`  Fetching page at offset ${skip}...`);
    const resp = await fetch(url, {
      headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
    });
    if (!resp.ok) throw new Error(`OData error ${resp.status}`);
    const data = await resp.json() as { d: { results: ODataRow[] } };
    allRows.push(...data.d.results);
    console.log(`  Got ${data.d.results.length} rows (total so far: ${allRows.length})`);
    skip += pageSize;
  }

  return allRows;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeData(rows: CSVEquivalentRow[]) {
  console.log('\n=== 2026 OData Analysis ===\n');
  console.log(`Total rows: ${rows.length}`);

  // Date range
  const dates = rows.map(r => r['Posting Date']).filter(Boolean).sort();
  console.log(`Date range: ${dates[0]} to ${dates[dates.length - 1]}`);

  // Business Partner breakdown
  const bpCounts = new Map<string, number>();
  const bpDebits = new Map<string, number>();
  const bpCredits = new Map<string, number>();

  for (const row of rows) {
    const bp = row['Business Partner'];
    bpCounts.set(bp, (bpCounts.get(bp) || 0) + 1);

    const debit = parseFloat((row['Debit Amount Company Currency'] || '0').replace(/,/g, '').replace(' USD', '')) || 0;
    const credit = parseFloat((row['Credit Amount Company Currency'] || '0').replace(/,/g, '').replace(' USD', '')) || 0;
    bpDebits.set(bp, (bpDebits.get(bp) || 0) + debit);
    bpCredits.set(bp, (bpCredits.get(bp) || 0) + credit);
  }

  console.log(`\nBusiness Partners (${bpCounts.size}):`);
  const sorted = [...bpCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [bp, count] of sorted) {
    const d = bpDebits.get(bp) || 0;
    const c = bpCredits.get(bp) || 0;
    console.log(`  ${bp}: ${count} rows, debits=$${d.toFixed(2)}, credits=$${c.toFixed(2)}, net=$${(d - c).toFixed(2)}`);
  }

  // Classification preview for "Not assigned"
  const naRows = rows.filter(r => r['Business Partner'] === 'Not assigned');
  let sbCount = 0, payrollCount = 0, accrualCount = 0, ccExpense = 0, vendorDesc = 0, other = 0;

  for (const r of naRows) {
    const desc = r['Journal Entry Item Text'];
    if (desc.startsWith('SB-')) sbCount++;
    else if (/^(\d{1,2}\.\d{2}\s+)?(Ern|Tax)\s*-/i.test(desc) || /Payroll/i.test(desc)) payrollCount++;
    else if (/Accrual/i.test(desc)) accrualCount++;
    else if (/401K|Vacation|PTO|HSA/i.test(desc)) payrollCount++;
    else if (/^[A-Z]{2,3}-\d{4}-/i.test(desc)) ccExpense++;
    else if (/SYNERGY|Viviota|Pinnacle|Navigator|NextGen|Winterwinds|Port53|Enverus|Amazon Web/i.test(desc)) vendorDesc++;
    else other++;
  }

  console.log(`\nNot assigned classification (${naRows.length} rows):`);
  console.log(`  SB- credit card: ${sbCount}`);
  console.log(`  CC expense (employee prefix): ${ccExpense}`);
  console.log(`  Payroll/benefits: ${payrollCount}`);
  console.log(`  Accrual: ${accrualCount}`);
  console.log(`  Vendor-in-description: ${vendorDesc}`);
  console.log(`  Other: ${other}`);

  // Compare structure to 2025 CSV columns
  console.log('\n=== Structure Comparison vs 2025 CSV ===');
  console.log('CSV Column                          → OData Field         → Match?');
  console.log('Posting Date                        → CPOSTING_DATE       → YES (epoch→MM/DD/YYYY)');
  console.log('Business Partner                    → TBUS_PART_UUID      → YES (text name)');
  console.log('Journal Entry Item Text             → CNOTE_IT            → YES');
  console.log('Offset Customer / Supplier ID       → TOFF_BUSPARTNER     → YES (text name)');
  console.log('Offset Operational Document ID      → COFF_OPD_F_ID      → YES (empty→#)');
  console.log('Operational Document ID             → COPDREF_F_ID       → YES (empty→#)');
  console.log('Debit Amount Company Currency       → FCDEBIT_CURRCOMP   → YES ("1,234.56 USD")');
  console.log('Credit Amount Company Currency      → FCCREDIT_CURRCOMP  → YES ("1,234.56 USD")');
  console.log('\nNote: "Not Assigned" (OData) normalized to "Not assigned" (CSV convention)');

  // Key differences from 2025
  console.log('\n=== Key Differences from 2025 ===');
  console.log(`  - NO SB- credit card rows (was 207 in 2025) — charges now use employee-initial prefixes`);
  console.log(`  - New vendor-in-desc patterns: Navigator sub, NextGen lic, Enverus sub, ByD/FV License`);
  console.log(`  - New BP: AMAZON WEB SERVICES INC (was SB- in 2025), ENVERUS DRILLING INFO INC`);
  console.log(`  - Rcls (reclassification) entries present for multiple vendors`);
  if (sbCount === 0) {
    console.log(`  - ETL SB- matching will have 0 hits for 2026 (expected per Trey: "one card now")`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('SAP GL OData Fetcher (2026 YTD)');
  console.log('===============================\n');

  // Fetch from OData
  const odataRows = await fetchAllRows();
  console.log(`\nFetched ${odataRows.length} rows from SAP OData`);

  // Transform to CSV-equivalent shape
  const csvRows = odataRows.map(odataToCSVRow);

  // Analyze
  analyzeData(csvRows);

  // Save transformed data as JSON (CSV-equivalent shape for ETL consumption)
  const outputPath = path.resolve(process.env.HOME || '~', 'Desktop', 'SAP-OData-2026.json');
  fs.writeFileSync(outputPath, JSON.stringify(csvRows, null, 2));
  console.log(`\nSaved ${csvRows.length} rows to: ${outputPath}`);

  // Also save raw OData response for reference
  const rawPath = path.resolve(process.env.HOME || '~', 'Desktop', 'SAP-OData-2026-raw.json');
  fs.writeFileSync(rawPath, JSON.stringify(odataRows, null, 2));
  console.log(`Saved raw OData response to: ${rawPath}`);
}

main().catch(err => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
