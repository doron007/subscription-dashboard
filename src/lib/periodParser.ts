/**
 * Period Parser Utility
 * Extracts service period dates from invoice line item descriptions
 */

import { startOfMonth, format, parse, isValid } from 'date-fns';

export interface ParsedPeriod {
    periodStart: Date | null;
    periodEnd: Date | null;
    billingMonth: string | null; // ISO date string for first of month, e.g., "2025-08-01"
}

/**
 * Common date patterns found in invoice descriptions:
 * - "8/01/2025-8/31/2025"
 * - "8/1/2025 - 8/31/2025"
 * - "08/01/2025-08/31/2025"
 * - "9/01/2025-\n9/30/2025" (with newline)
 */
const DATE_RANGE_PATTERNS = [
    // M/D/YYYY-M/D/YYYY or M/DD/YYYY-M/DD/YYYY (with optional spaces and newlines around dash)
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–]\s*\n?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    // MM-DD-YYYY to MM-DD-YYYY
    /(\d{1,2})-(\d{1,2})-(\d{4})\s*(?:to|[-–])\s*(\d{1,2})-(\d{1,2})-(\d{4})/i,
    // YYYY-MM-DD to YYYY-MM-DD (ISO format)
    /(\d{4})-(\d{2})-(\d{2})\s*(?:to|[-–])\s*(\d{4})-(\d{2})-(\d{2})/i,
];

/**
 * Month name patterns for descriptions like "August 2025" or "Aug 2025"
 */
const MONTH_PATTERNS = [
    // "August 2025" or "Aug 2025"
    /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i,
];

const MONTH_MAP: Record<string, number> = {
    'january': 0, 'jan': 0,
    'february': 1, 'feb': 1,
    'march': 2, 'mar': 2,
    'april': 3, 'apr': 3,
    'may': 4,
    'june': 5, 'jun': 5,
    'july': 6, 'jul': 6,
    'august': 7, 'aug': 7,
    'september': 8, 'sep': 8,
    'october': 9, 'oct': 9,
    'november': 10, 'nov': 10,
    'december': 11, 'dec': 11,
};

/**
 * Parse a date range from a line item description
 */
export function parsePeriodFromDescription(description: string): ParsedPeriod {
    if (!description) {
        return { periodStart: null, periodEnd: null, billingMonth: null };
    }

    // Try date range patterns first (most specific)
    for (const pattern of DATE_RANGE_PATTERNS) {
        const match = description.match(pattern);
        if (match) {
            let startDate: Date | null = null;
            let endDate: Date | null = null;

            // Check if ISO format (YYYY-MM-DD)
            if (match[1].length === 4) {
                // ISO format: YYYY-MM-DD
                startDate = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
                endDate = new Date(parseInt(match[4]), parseInt(match[5]) - 1, parseInt(match[6]));
            } else {
                // US format: M/D/YYYY
                const startMonth = parseInt(match[1]) - 1;
                const startDay = parseInt(match[2]);
                const startYear = parseInt(match[3]);
                const endMonth = parseInt(match[4]) - 1;
                const endDay = parseInt(match[5]);
                const endYear = parseInt(match[6]);

                startDate = new Date(startYear, startMonth, startDay);
                endDate = new Date(endYear, endMonth, endDay);
            }

            if (isValid(startDate) && isValid(endDate)) {
                const billingMonth = format(startOfMonth(startDate), 'yyyy-MM-dd');
                return { periodStart: startDate, periodEnd: endDate, billingMonth };
            }
        }
    }

    // Try month name patterns
    for (const pattern of MONTH_PATTERNS) {
        const match = description.match(pattern);
        if (match) {
            const monthName = match[1].toLowerCase();
            const year = parseInt(match[2]);
            const month = MONTH_MAP[monthName];

            if (month !== undefined && !isNaN(year)) {
                const startDate = new Date(year, month, 1);
                const endDate = new Date(year, month + 1, 0); // Last day of month
                const billingMonth = format(startOfMonth(startDate), 'yyyy-MM-dd');
                return { periodStart: startDate, periodEnd: endDate, billingMonth };
            }
        }
    }

    return { periodStart: null, periodEnd: null, billingMonth: null };
}

/**
 * Resolve the billing month for a line item using the priority hierarchy:
 * 1. Manual override (billing_month_override)
 * 2. Database period_start field
 * 3. Parsed from description
 * 4. Invoice date (fallback)
 */
export function resolveBillingMonth(
    billingMonthOverride: string | null,
    periodStart: string | null,
    description: string,
    invoiceDate: string
): string {
    // 1. Manual override takes highest priority
    if (billingMonthOverride) {
        return billingMonthOverride;
    }

    // 2. Database period_start field
    if (periodStart) {
        const date = new Date(periodStart);
        if (isValid(date)) {
            return format(startOfMonth(date), 'yyyy-MM-dd');
        }
    }

    // 3. Parse from description
    const parsed = parsePeriodFromDescription(description);
    if (parsed.billingMonth) {
        return parsed.billingMonth;
    }

    // 4. Fallback to invoice date
    if (invoiceDate) {
        const date = new Date(invoiceDate);
        if (isValid(date)) {
            return format(startOfMonth(date), 'yyyy-MM-dd');
        }
    }

    // Last resort: current month
    return format(startOfMonth(new Date()), 'yyyy-MM-dd');
}
