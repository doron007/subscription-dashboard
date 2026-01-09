import { RawInvoice, AnalyzedInvoice, AnalyzedLineItem } from './types';

/**
 * Removes date patterns from a string.
 */
export function stripDateFromText(text: string): string {
    if (!text) return "";
    const patterns = [
        /\(?\d{1,2}\/\d{1,2}\/\d{2,4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{2,4}\)?/g,
        /\d{4}-\d{1,2}-\d{1,2}/g,
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/gi,
        /Service Period:?.*/i
    ];

    let cleaned = text;
    for (const p of patterns) {
        cleaned = cleaned.replace(p, '');
    }
    cleaned = cleaned.replace(/\(\s*\)/g, '');
    return cleaned.replace(/\s+/g, ' ').trim().replace(/[-:]$/, '');
}

/**
 * Validates and aggregates the Raw Invoice into a structured Analyzed Invoice.
 */
export function aggregateInvoice(raw: RawInvoice): AnalyzedInvoice {
    const analyzedLines: AnalyzedLineItem[] = [];

    for (const item of raw.line_items) {
        // Strip dates to find the "Canon" service name
        const serviceName = stripDateFromText(item.description);

        // Attempt to extract dates if they exist in the raw description for "Period" fields
        // (Simple heuristic for now, can be improved with NLP later)
        let periodStart: string | undefined;
        let periodEnd: string | undefined;

        analyzedLines.push({
            description: item.description, // Keep original description for Reference
            service_name: serviceName,     // The "Catalog" name
            quantity: item.quantity || 1,
            unit_price: item.unit_price || item.total, // Fallback if missing
            total_amount: item.total,
            period_start: periodStart,
            period_end: periodEnd
        });
    }

    // Sort by largest cost first
    analyzedLines.sort((a, b) => b.total_amount - a.total_amount);

    return {
        vendor: {
            name: raw.vendor_name || "Unknown Vendor",
            website: "" // TODO: Could extract from email or metadata later
        },
        invoice: {
            // Generate stable invoice number if missing (for idempotency)
            // Use hash of vendor+date+total so re-imports match the same invoice
            number: raw.invoice_number || `INV-${raw.vendor_name?.slice(0, 10) || 'UNK'}-${(raw.invoice_date || '').replace(/\D/g, '')}-${Math.round(raw.total_amount)}`,
            date: raw.invoice_date || new Date().toISOString().split('T')[0],
            total_amount: raw.total_amount,
            currency: raw.currency || 'USD'
        },
        line_items: analyzedLines,
        summary: {
            total_lines: analyzedLines.length,
            confidence_score: raw.confidence_score
        }
    };
}
