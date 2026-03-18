// ─── SAP Amount / Date Parsers ──────────────────────────────────────────────

/**
 * Parse formatted SAP amount strings like "22,598.80 USD".
 * Handles commas, USD suffix, and empty/null values.
 */
export function parseSAPAmount(value: string): number {
  if (!value || typeof value !== 'string') return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  // Remove " USD" suffix and commas
  const cleaned = trimmed.replace(/\s*USD\s*$/i, '').replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse SAP date from MM/DD/YYYY to ISO YYYY-MM-DD.
 */
export function parseSAPDate(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  // MM/DD/YYYY -> YYYY-MM-DD
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, m, d, y] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return trimmed;
}

/**
 * Parse OData epoch date format /Date(1234567890000)/ to ISO YYYY-MM-DD.
 */
export function parseODataEpoch(odataDate: string): string {
  if (!odataDate) return '';
  const match = odataDate.match(/\/Date\((\d+)\)\//);
  if (match) {
    const date = new Date(parseInt(match[1]));
    return date.toISOString().substring(0, 10);
  }
  return odataDate;
}

/**
 * Extract billing month (first-of-month) from an ISO date string.
 */
export function getBillingMonth(isoDate: string): string {
  if (!isoDate || isoDate.length < 7) return '';
  return isoDate.substring(0, 7) + '-01';
}

/**
 * Parse raw numeric amount for KC* fields (just parseFloat).
 */
export function parseRawAmount(value: string): number {
  if (!value || typeof value !== 'string') return 0;
  const num = parseFloat(value.trim());
  return isNaN(num) ? 0 : num;
}
