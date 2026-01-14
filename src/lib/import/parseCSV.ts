import type { RawCSVRow, ParsedLineItem, ParsedInvoice } from './types';

/**
 * Parse a currency string from SAP format
 * Handles: "25,202.04", "(1,234.56)", "-1,234.56", "  -  " (empty)
 */
export function parseCurrency(value: string): number {
    if (!value || typeof value !== 'string') return 0;

    const trimmed = value.trim();

    // Handle empty/dash values
    if (trimmed === '-' || trimmed === '' || trimmed === '-  ' || /^[\s-]+$/.test(trimmed)) {
        return 0;
    }

    // Check for negative (parentheses or leading minus)
    const isNegative = trimmed.startsWith('(') || trimmed.startsWith('-') || trimmed.startsWith('"-');

    // Remove currency symbols, commas, parentheses, quotes, spaces
    let cleaned = trimmed
        .replace(/[$"()]/g, '')
        .replace(/,/g, '')
        .replace(/\s+/g, '')
        .replace(/^-/, '');

    const num = parseFloat(cleaned);

    if (isNaN(num)) return 0;
    return isNegative ? -Math.abs(num) : num;
}

/**
 * Parse quantity from SAP format
 */
export function parseQuantity(value: string): number {
    if (!value || typeof value !== 'string') return 1;

    const trimmed = value.trim();
    if (trimmed === '' || trimmed === '-') return 1;

    // Remove commas
    const cleaned = trimmed.replace(/,/g, '');
    const num = parseFloat(cleaned);

    return isNaN(num) ? 1 : num;
}

/**
 * Parse date from SAP format (M/D/YY)
 * Returns ISO date string (YYYY-MM-DD)
 */
export function parseDate(value: string): string {
    if (!value || typeof value !== 'string') return '';

    const trimmed = value.trim();
    if (!trimmed) return '';

    // Handle M/D/YY format
    const parts = trimmed.split('/');
    if (parts.length === 3) {
        const month = parts[0].padStart(2, '0');
        const day = parts[1].padStart(2, '0');
        let year = parts[2];

        // Convert 2-digit year to 4-digit
        if (year.length === 2) {
            const yearNum = parseInt(year);
            year = yearNum >= 50 ? `19${year}` : `20${year}`;
        }

        return `${year}-${month}-${day}`;
    }

    return trimmed;
}

/**
 * Generate a unique key for a line item
 * Based on: invoice + description + service month + quantity + unit price + total
 * Total is included to distinguish offsetting entries (charges vs credits)
 */
export function generateLineItemKey(
    invoiceNumber: string,
    description: string,
    serviceMonth: string,
    quantity: number,
    unitPrice: number,
    totalPrice: number
): string {
    // Normalize description for matching
    const normalizedDesc = description
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    // Include quantity, unit price, AND total to distinguish same-description items
    // with different pricing tiers or offsetting credits
    return `${invoiceNumber}|${normalizedDesc}|${serviceMonth}|${quantity}|${unitPrice}|${totalPrice}`;
}

/**
 * Extract period dates from line item description
 * Pattern: "... 4/1/25-4/30/25" or "4/1/25-4/30/25"
 */
export function extractPeriodFromDescription(description: string): { periodStart: string; periodEnd: string } | null {
    // Match pattern like "4/1/25-4/30/25" at the end of description
    const match = description.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})-(\d{1,2}\/\d{1,2}\/\d{2,4})$/);

    if (match) {
        return {
            periodStart: parseDate(match[1]),
            periodEnd: parseDate(match[2])
        };
    }

    return null;
}

/**
 * Normalize service name for better matching
 * Fixes common typos and variations
 */
export function normalizeServiceName(description: string): string {
    let normalized = description;

    // Fix common typos
    normalized = normalized.replace(/Microsoft 65\b/g, 'Microsoft 365');

    // Standardize prefixes
    // Keep the category prefix but normalize formatting

    return normalized;
}

/**
 * Parse raw CSV rows into structured line items
 */
export function parseCSVRows(rows: RawCSVRow[]): ParsedLineItem[] {
    return rows.map(row => {
        const vendor = (row.Vendor || '').trim();
        const invoiceNumber = (row.Invoice || '').trim();
        const invoiceDate = parseDate(row['Invoice Date'] || '');
        const serviceMonth = (row['Service Month'] || '').trim();
        const description = normalizeServiceName((row['Line Item'] || '').trim());
        const quantity = parseQuantity(row.QTY);

        // Handle space-padded headers from SAP
        const unitPriceRaw = row[' Unit Price '] || row['Unit Price'] || '0';
        const totalPriceRaw = row[' Total Price '] || row['Total Price'] || '0';

        const unitPrice = parseCurrency(unitPriceRaw);
        const totalPrice = parseCurrency(totalPriceRaw);

        const paidValue = (row.Paid || '').trim();
        const isVoided = paidValue.toLowerCase() === 'voided';
        const paidDate = isVoided ? null : parseDate(paidValue);

        const lineItemKey = generateLineItemKey(
            invoiceNumber,
            description,
            serviceMonth,
            quantity,
            unitPrice,
            totalPrice
        );

        return {
            vendor,
            invoiceNumber,
            invoiceDate,
            serviceMonth,
            description,
            quantity,
            unitPrice,
            totalPrice,
            paidDate,
            isVoided,
            lineItemKey
        };
    });
}

/**
 * Group parsed line items into invoices
 */
export function groupByInvoice(lineItems: ParsedLineItem[]): ParsedInvoice[] {
    const invoiceMap = new Map<string, ParsedInvoice>();

    for (const item of lineItems) {
        const key = `${item.vendor}|${item.invoiceNumber}`;

        if (!invoiceMap.has(key)) {
            invoiceMap.set(key, {
                vendor: item.vendor,
                invoiceNumber: item.invoiceNumber,
                invoiceDate: item.invoiceDate,
                totalAmount: 0,
                isVoided: item.isVoided,
                paidDate: item.paidDate,
                lineItems: []
            });
        }

        const invoice = invoiceMap.get(key)!;
        invoice.lineItems.push(item);
        invoice.totalAmount += item.totalPrice;

        // If any line item is voided, mark invoice as voided
        if (item.isVoided) {
            invoice.isVoided = true;
        }
    }

    return Array.from(invoiceMap.values());
}

/**
 * Main entry point: parse CSV data into structured format
 */
export function parseImportCSV(csvData: any[]): {
    lineItems: ParsedLineItem[];
    invoices: ParsedInvoice[];
    vendors: string[];
} {
    // Filter out empty rows
    const validRows = csvData.filter(row =>
        row.Vendor && row.Invoice && row['Line Item']
    ) as RawCSVRow[];

    const lineItems = parseCSVRows(validRows);
    const invoices = groupByInvoice(lineItems);

    // Get unique vendors
    const vendors = [...new Set(lineItems.map(item => item.vendor))];

    return { lineItems, invoices, vendors };
}
