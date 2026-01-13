import { RawInvoice, AnalyzedInvoice, AnalyzedLineItem } from './types';

/**
 * Removes date patterns from a string.
 */
export function stripDateFromText(text: string): string {
    if (!text) return "";
    const patterns = [
        /\(?\d{1,2}\/\d{1,2}\/\d{2,4}\s*[-–]\s*\n?\s*\d{1,2}\/\d{1,2}\/\d{2,4}\)?/g,
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
 * Normalizes a service name to create a canonical identifier.
 * Handles common variations in Microsoft CSP invoice line items:
 * - NCElineItemCharges / NCELineItemCharges / NCEIineItemCharges (typo) variations
 * - Spacing inconsistencies (CSP - vs CSP-)
 * - Case variations
 * - Quote style variations
 */
export function normalizeServiceName(text: string): string {
    if (!text) return "";

    let normalized = stripDateFromText(text);

    // Remove common suffixes that vary in casing/typos
    // NCElineItemCharges, NCELineItemCharges, NCEIineItemCharges (typo with lowercase L)
    normalized = normalized.replace(/\s*NCE[lLI]ine[iI]tem[cC]harges\s*/gi, '');

    // Remove "Service:" and "Service -" prefix variations
    normalized = normalized.replace(/\bService[:\s-]+/gi, '');

    // Normalize "CSP -" vs "CSP-" vs "CSP " spacing
    normalized = normalized.replace(/\bCSP\s*-\s*/gi, 'CSP - ');

    // Remove redundant "CSP - " after "Software Licensing -" or "Azure Consumption -"
    normalized = normalized.replace(/(Software Licensing|Azure Consumption|Service)\s*-\s*CSP\s*-\s*/gi, '$1 - ');

    // Normalize country/region zone references
    // "country region 1" / "Country Zone "1" / "country zone 1" -> "(US)"
    normalized = normalized.replace(/\s*\(?\s*[Cc]ountry\s+(?:[Zz]one|[Rr]egion)\s*"?\s*1\s*-?\s*US\s*"?\s*\)?/gi, ' (US)');

    // Normalize "Microsoft 365 Apps for enterprise" vs "Enterprise" (case)
    normalized = normalized.replace(/Microsoft 365 Apps for [Ee]nterprise/gi, 'Microsoft 365 Apps for Enterprise');

    // Normalize "includes dial out" vs "Includes dial out"
    normalized = normalized.replace(/[Ii]ncludes [Dd]ial [Oo]ut/gi, 'includes dial out');

    // Collapse multiple spaces
    normalized = normalized.replace(/\s+/g, ' ').trim();

    // Remove trailing dashes or colons
    normalized = normalized.replace(/[-:]+$/, '').trim();

    return normalized;
}

/**
 * Extract period dates from description text.
 * Supports formats like: "8/01/2025-8/31/2025", "8/1/2025 - 8/31/2025"
 */
export function extractPeriodDates(description: string): { periodStart?: string; periodEnd?: string } {
    if (!description) return {};

    // Pattern: M/D/YYYY-M/D/YYYY (with optional spaces/newlines around dash)
    const dateRangePattern = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–]\s*\n?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/;
    const match = description.match(dateRangePattern);

    if (match) {
        const startMonth = parseInt(match[1]);
        const startDay = parseInt(match[2]);
        const startYear = parseInt(match[3]);
        const endMonth = parseInt(match[4]);
        const endDay = parseInt(match[5]);
        const endYear = parseInt(match[6]);

        // Validate the parsed values
        if (startMonth >= 1 && startMonth <= 12 && startDay >= 1 && startDay <= 31 &&
            endMonth >= 1 && endMonth <= 12 && endDay >= 1 && endDay <= 31 &&
            startYear >= 2000 && startYear <= 2100 && endYear >= 2000 && endYear <= 2100) {

            const periodStart = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
            const periodEnd = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

            return { periodStart, periodEnd };
        }
    }

    return {};
}

/**
 * Validates and aggregates the Raw Invoice into a structured Analyzed Invoice.
 */
export function aggregateInvoice(raw: RawInvoice): AnalyzedInvoice {
    const analyzedLines: AnalyzedLineItem[] = [];

    for (const item of raw.line_items) {
        // Normalize to find the canonical service name
        const serviceName = normalizeServiceName(item.description);

        // Extract period dates from the description
        const { periodStart, periodEnd } = extractPeriodDates(item.description);

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
            // Use date+total only (not vendor name) so re-imports with slight vendor name variations still match
            number: raw.invoice_number || `INV-${(raw.invoice_date || '').replace(/\D/g, '')}-${Math.round(raw.total_amount)}`,
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
