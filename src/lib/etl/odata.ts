// ─── OData SAP GL Fetching ──────────────────────────────────────────────────

import type { SAPRow, ODataCredentials } from './types';
import { parseSAPAmount, parseSAPDate, parseODataEpoch, parseRawAmount } from './parsers';

/**
 * Fetch SAP GL data live from an OData endpoint.
 * Accepts credentials as parameter (no process.env dependency).
 */
export async function fetchODataLive(credentials: ODataCredentials): Promise<SAPRow[]> {
  const { baseUrl, username, password, year } = credentials;

  // Build OData query URL with parameters in code (avoids $ escaping issues in .env)
  const selectFields = 'TBUS_PART_UUID,CNOTE_IT,COFF_BUSPARTNER,COFF_OPD_F_ID,COPDREF_F_ID,CPOSTING_DATE,KCCREDIT_CURRCOMP,KCDEBIT_CURRCOMP';
  const filterYear = year || new Date().getFullYear();
  const dateFilter = `CPOSTING_DATE ge datetime'${filterYear}-01-01T00:00:00'`;

  // If baseUrl already has query params, use it as-is; otherwise build the query
  const hasParams = baseUrl.includes('?');
  const url = hasParams
    ? baseUrl
    : `${baseUrl}?$select=${selectFields}&$filter=${encodeURIComponent(dateFilter)}&$top=10000000&$format=json`;

  const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`OData fetch failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const results = data.d?.results || data.d || [];

  return parseODataResults(results);
}

/**
 * Parse an OData JSON file (saved from a previous fetch) into SAPRows.
 */
export function parseODataJSON(filePath: string): SAPRow[] {
  // Dynamic import fs to keep this module usable in both Node and edge contexts
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const results = data.d?.results || data.d || [];
  return parseODataResults(results);
}

/**
 * Parse OData result array into SAPRow[].
 * Handles BOTH field naming conventions:
 * - Old: FCDEBIT_CURRCOMP (formatted "22,598.80 USD"), FCCREDIT_CURRCOMP
 * - New: KCDEBIT_CURRCOMP (raw "22598.800000"), KCCREDIT_CURRCOMP
 * Strategy: try KC* first (parseFloat), fall back to FC* (parseSAPAmount)
 */
function parseODataResults(results: Record<string, any>[]): SAPRow[] {
  return results.map(row => {
    // Amount parsing: try KC* (raw numeric) first, fall back to FC* (formatted)
    let debitAmount: number;
    let creditAmount: number;

    if (row['KCDEBIT_CURRCOMP'] !== undefined && row['KCDEBIT_CURRCOMP'] !== null) {
      debitAmount = parseRawAmount(String(row['KCDEBIT_CURRCOMP']));
      creditAmount = parseRawAmount(String(row['KCCREDIT_CURRCOMP'] || '0'));
    } else {
      debitAmount = parseSAPAmount(String(row['FCDEBIT_CURRCOMP'] || ''));
      creditAmount = parseSAPAmount(String(row['FCCREDIT_CURRCOMP'] || ''));
    }

    // Posting date: handle OData epoch format /Date(...)/ or plain string
    let postingDate = '';
    const rawDate = row['CPOSTING_DATE'] || row['POSTING_DATE'] || row['PostingDate'] || row['BUDAT'] || '';
    if (typeof rawDate === 'string' && rawDate.includes('/Date(')) {
      postingDate = parseODataEpoch(rawDate);
    } else if (typeof rawDate === 'string') {
      postingDate = parseSAPDate(rawDate);
    }

    // Business Partner: handle TBUS_PART_UUID, normalize "Not Assigned" -> "Not assigned"
    let businessPartner = String(
      row['TBUS_PART_UUID'] || row['CBUS_PART_UUID'] || row['BusinessPartner'] || row['KUNNR'] || ''
    ).trim();
    if (businessPartner === 'Not Assigned') {
      businessPartner = 'Not assigned';
    }

    return {
      postingDate,
      businessPartner,
      description: String(row['CNOTE_IT'] || row['SGTXT'] || row['JournalEntryItemText'] || row['ItemText'] || '').trim(),
      offsetSupplier: String(row['COFF_BUSPARTNER'] || row['OFFSET_SUPPLIER'] || row['OffsetCustomerSupplier'] || '').trim(),
      offsetDocId: String(row['COFF_OPD_F_ID'] || row['OFFSET_DOC_ID'] || row['OffsetOperationalDocID'] || '').trim(),
      operationalDocId: String(row['COPDREF_F_ID'] || row['OPERATIONAL_DOC_ID'] || row['OperationalDocID'] || '').trim(),
      debitAmount,
      creditAmount,
      rawRow: row,
    };
  });
}
