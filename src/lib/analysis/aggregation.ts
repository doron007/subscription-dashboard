import { RawInvoice, AggregatedSubscription } from './types';

/**
 * Removes date patterns from a string to allow grouping.
 * e.g. "Microsoft 365 E3 (Jan 01 - Jan 31)" -> "Microsoft 365 E3"
 */
export function stripDateFromText(text: string): string {
    if (!text) return "";

    // Common Date Patterns
    const patterns = [
        // MM/DD/YYYY - MM/DD/YYYY (with optional parens)
        /\(?\d{1,2}\/\d{1,2}\/\d{2,4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{2,4}\)?/g,
        // YYYY-MM-DD
        /\d{4}-\d{1,2}-\d{1,2}/g,
        // Short Month Names with Year (Jan 2024)
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/gi,
        // Just the date range usually found in invoices: "Service period: ..."
        /Service Period:?.*/i
    ];

    let cleaned = text;
    for (const p of patterns) {
        cleaned = cleaned.replace(p, '');
    }

    // Remove empty parens "()" if they were left behind
    cleaned = cleaned.replace(/\(\s*\)/g, '');

    // Trim whitespace and trailing punctuation
    return cleaned.replace(/\s+/g, ' ').trim().replace(/[-:]$/, '');
}

/**
 * The Brain: Converts a Raw Invoice (dumb list) into a Single Subscription (smart grouping).
 */
export function aggregateInvoice(raw: RawInvoice): AggregatedSubscription {
    const groupedItems: Record<string, { cost: number; originalDate: string }> = {};

    // 1. Group Line Items
    for (const item of raw.line_items) {
        const cleanName = stripDateFromText(item.description);

        if (!groupedItems[cleanName]) {
            groupedItems[cleanName] = { cost: 0, originalDate: raw.invoice_date || new Date().toISOString() };
        }

        // Sum the costs
        groupedItems[cleanName].cost += item.total;
    }

    // 2. Convert back to array
    const consolidatedLineItems = Object.entries(groupedItems).map(([desc, data]) => ({
        description: desc,
        cost: Number(data.cost.toFixed(2)),
        date: data.originalDate
    }));

    // 3. Create the Subscription Object
    // We enforce the "One Invoice = One Subscription" rule here.
    return {
        name: raw.vendor_name || "Unknown Vendor",
        category: "Software", // Placeholder, could be enhanced with categorization logic later
        cost: Number(raw.total_amount.toFixed(2)),
        last_transaction_date: raw.invoice_date || new Date().toISOString().split('T')[0],
        confidence: raw.confidence_score,
        reasoning: `Consolidated ${raw.line_items.length} raw lines into ${consolidatedLineItems.length} unique items.`,
        line_items: consolidatedLineItems
    };
}
