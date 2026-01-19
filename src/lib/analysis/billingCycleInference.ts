import type { BillingCycle } from '@/types';

interface InferenceResult {
    cycle: BillingCycle;
    confidence: number;
    averageDaysBetweenInvoices: number;
    invoiceCount: number;
}

/**
 * Infers the billing cycle from a list of invoice dates.
 * Analyzes the pattern of invoice intervals to determine if billing is
 * Monthly, Quarterly, Annual, or As Needed (irregular).
 *
 * @param invoiceDates Array of invoice dates (Date objects or ISO strings)
 * @returns Inferred billing cycle with confidence score
 */
export function inferBillingCycle(invoiceDates: (Date | string)[]): InferenceResult {
    // Default result for insufficient data
    const defaultResult: InferenceResult = {
        cycle: 'Monthly',
        confidence: 0,
        averageDaysBetweenInvoices: 0,
        invoiceCount: invoiceDates.length
    };

    // Need at least 3 invoices to infer a pattern
    if (invoiceDates.length < 3) {
        return defaultResult;
    }

    // Convert to Date objects and sort chronologically
    const dates = invoiceDates
        .map(d => typeof d === 'string' ? new Date(d) : d)
        .filter(d => !isNaN(d.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());

    if (dates.length < 3) {
        return defaultResult;
    }

    // Calculate intervals between consecutive invoices (in days)
    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
        const diffMs = dates[i].getTime() - dates[i - 1].getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        intervals.push(diffDays);
    }

    // Calculate average and standard deviation
    const avgDays = intervals.reduce((sum, d) => sum + d, 0) / intervals.length;
    const variance = intervals.reduce((sum, d) => sum + Math.pow(d - avgDays, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    // Coefficient of variation - measure of regularity
    const cv = avgDays > 0 ? stdDev / avgDays : Infinity;

    // Determine billing cycle based on average interval
    let cycle: BillingCycle;
    let confidence: number;

    // Thresholds with tolerance for real-world billing variations
    if (avgDays <= 14) {
        // Weekly or bi-weekly - treat as "As Needed"
        cycle = 'As Needed';
        confidence = cv < 0.3 ? 0.8 : 0.6;
    } else if (avgDays >= 20 && avgDays <= 45) {
        // Monthly (typically 28-31 days, with some tolerance)
        cycle = 'Monthly';
        confidence = cv < 0.2 ? 0.9 : cv < 0.4 ? 0.7 : 0.5;
    } else if (avgDays >= 75 && avgDays <= 105) {
        // Quarterly (typically 90 days)
        cycle = 'Quarterly';
        confidence = cv < 0.2 ? 0.9 : cv < 0.4 ? 0.7 : 0.5;
    } else if (avgDays >= 330 && avgDays <= 400) {
        // Annual (typically 365 days)
        cycle = 'Annual';
        confidence = cv < 0.15 ? 0.9 : cv < 0.3 ? 0.7 : 0.5;
    } else if (cv > 0.5) {
        // High variance - irregular billing
        cycle = 'As Needed';
        confidence = 0.7;
    } else {
        // Doesn't fit standard patterns - default to closest match
        if (avgDays < 60) {
            cycle = 'Monthly';
        } else if (avgDays < 180) {
            cycle = 'Quarterly';
        } else {
            cycle = 'Annual';
        }
        confidence = 0.4; // Low confidence for edge cases
    }

    return {
        cycle,
        confidence,
        averageDaysBetweenInvoices: Math.round(avgDays),
        invoiceCount: dates.length
    };
}

/**
 * Formats the inference result as a human-readable string.
 */
export function formatInferenceResult(result: InferenceResult): string {
    const confidenceLabel = result.confidence >= 0.8 ? 'High' : result.confidence >= 0.5 ? 'Medium' : 'Low';
    return `${result.cycle} (${confidenceLabel} confidence, avg ${result.averageDaysBetweenInvoices} days between invoices)`;
}
