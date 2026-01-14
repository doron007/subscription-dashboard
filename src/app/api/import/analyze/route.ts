import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseImportCSV, extractPeriodFromDescription } from '@/lib/import/parseCSV';
import type {
    ImportAnalysis,
    InvoiceDiff,
    LineItemDiff,
    FieldDiff,
    DiffType,
    ParsedInvoice,
    ParsedLineItem
} from '@/lib/import/types';

// Tolerance for comparing amounts (cents)
const AMOUNT_TOLERANCE = 0.01;

function amountsEqual(a: number, b: number): boolean {
    return Math.abs(a - b) < AMOUNT_TOLERANCE;
}

/**
 * Generate a simplified key for matching existing line items
 * Since existing items don't have serviceMonth, we use description + invoice
 */
function generateExistingLineItemKey(
    invoiceNumber: string,
    description: string,
    quantity: number,
    unitPrice: number
): string {
    const normalizedDesc = description
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    return `${invoiceNumber}|${normalizedDesc}|${quantity}|${unitPrice}`;
}

/**
 * Compare two line items and return field diffs
 */
function compareLineItems(
    existing: { quantity: number; unitPrice: number; totalAmount: number } | null,
    incoming: { quantity: number; unitPrice: number; totalAmount: number }
): FieldDiff[] {
    if (!existing) return [];

    const diffs: FieldDiff[] = [];

    if (!amountsEqual(existing.quantity, incoming.quantity)) {
        diffs.push({
            field: 'quantity',
            existingValue: existing.quantity,
            newValue: incoming.quantity,
            isDifferent: true
        });
    }

    if (!amountsEqual(existing.unitPrice, incoming.unitPrice)) {
        diffs.push({
            field: 'unitPrice',
            existingValue: existing.unitPrice,
            newValue: incoming.unitPrice,
            isDifferent: true
        });
    }

    if (!amountsEqual(existing.totalAmount, incoming.totalAmount)) {
        diffs.push({
            field: 'totalAmount',
            existingValue: existing.totalAmount,
            newValue: incoming.totalAmount,
            isDifferent: true
        });
    }

    return diffs;
}

/**
 * Analyze a single invoice against existing data
 */
async function analyzeInvoice(
    parsedInvoice: ParsedInvoice,
    existingInvoice: any | null,
    existingLineItems: any[]
): Promise<InvoiceDiff> {
    const lineItemDiffs: LineItemDiff[] = [];
    const matchedExistingKeys = new Set<string>();

    // Determine invoice diff type
    let invoiceDiffType: DiffType;
    if (parsedInvoice.isVoided) {
        invoiceDiffType = 'VOIDED';
    } else if (!existingInvoice) {
        invoiceDiffType = 'NEW';
    } else {
        invoiceDiffType = 'UNCHANGED'; // Will update if line items changed
    }

    // Map existing line items by a matchable key
    const existingByKey = new Map<string, any>();
    for (const item of existingLineItems) {
        // Create multiple possible keys to improve matching
        const key1 = generateExistingLineItemKey(
            parsedInvoice.invoiceNumber,
            item.description,
            item.quantity,
            item.unitPrice
        );
        existingByKey.set(key1, item);

        // Also key by description alone for looser matching
        const descKey = item.description.toLowerCase().replace(/\s+/g, ' ').trim();
        if (!existingByKey.has(descKey)) {
            existingByKey.set(descKey, item);
        }
    }

    // Analyze each incoming line item
    for (const incomingItem of parsedInvoice.lineItems) {
        // Try exact match first
        let matchedExisting: any = null;
        let matchKey: string | null = null;

        // Try full key match
        const fullKey = `${parsedInvoice.invoiceNumber}|${incomingItem.description.toLowerCase().replace(/\s+/g, ' ').trim()}|${incomingItem.quantity}|${incomingItem.unitPrice}`;
        if (existingByKey.has(fullKey)) {
            matchedExisting = existingByKey.get(fullKey);
            matchKey = fullKey;
        }

        // If no exact match, try description-only match
        if (!matchedExisting) {
            const descKey = incomingItem.description.toLowerCase().replace(/\s+/g, ' ').trim();
            if (existingByKey.has(descKey)) {
                matchedExisting = existingByKey.get(descKey);
                matchKey = descKey;
            }
        }

        let diffType: DiffType;
        let fieldDiffs: FieldDiff[] = [];

        if (parsedInvoice.isVoided) {
            diffType = 'VOIDED';
        } else if (!matchedExisting) {
            diffType = 'NEW';
        } else {
            matchedExistingKeys.add(matchKey!);
            fieldDiffs = compareLineItems(
                {
                    quantity: matchedExisting.quantity,
                    unitPrice: matchedExisting.unitPrice,
                    totalAmount: matchedExisting.totalAmount
                },
                {
                    quantity: incomingItem.quantity,
                    unitPrice: incomingItem.unitPrice,
                    totalAmount: incomingItem.totalPrice
                }
            );
            diffType = fieldDiffs.length > 0 ? 'CHANGED' : 'UNCHANGED';
        }

        // If any line items changed, update invoice diff type
        if (diffType === 'CHANGED' || diffType === 'NEW') {
            if (invoiceDiffType === 'UNCHANGED') {
                invoiceDiffType = 'CHANGED';
            }
        }

        const period = extractPeriodFromDescription(incomingItem.description);

        lineItemDiffs.push({
            diffType,
            lineItemKey: incomingItem.lineItemKey,
            description: incomingItem.description,
            existing: matchedExisting ? {
                quantity: matchedExisting.quantity,
                unitPrice: matchedExisting.unitPrice,
                totalAmount: matchedExisting.totalAmount,
                periodStart: matchedExisting.periodStart,
                periodEnd: matchedExisting.periodEnd
            } : null,
            incoming: {
                quantity: incomingItem.quantity,
                unitPrice: incomingItem.unitPrice,
                totalAmount: incomingItem.totalPrice,
                serviceMonth: incomingItem.serviceMonth
            },
            fieldDiffs,
            selected: diffType !== 'UNCHANGED' && diffType !== 'VOIDED',
            mergeStrategy: 'csv_wins'
        });
    }

    // Find removed line items (exist in DB but not in CSV)
    for (const [key, existingItem] of existingByKey) {
        // Skip if we already matched this item
        if (matchedExistingKeys.has(key)) continue;

        // Only count unique items (avoid duplicates from multiple keys)
        const itemId = existingItem.id;
        const alreadyProcessed = lineItemDiffs.some(
            d => d.existing && d.diffType === 'REMOVED'
        );
        if (alreadyProcessed) continue;

        // This item exists in DB but wasn't in CSV - mark as potentially removed
        // But only if this is an update scenario (existing invoice)
        if (existingInvoice && !parsedInvoice.isVoided) {
            lineItemDiffs.push({
                diffType: 'REMOVED',
                lineItemKey: `existing-${itemId}`,
                description: existingItem.description,
                existing: {
                    quantity: existingItem.quantity,
                    unitPrice: existingItem.unitPrice,
                    totalAmount: existingItem.totalAmount,
                    periodStart: existingItem.periodStart,
                    periodEnd: existingItem.periodEnd
                },
                incoming: null,
                fieldDiffs: [],
                selected: false, // Don't auto-select removals
                mergeStrategy: 'keep_existing'
            });
        }
    }

    // Calculate stats
    const stats = {
        newLineItems: lineItemDiffs.filter(d => d.diffType === 'NEW').length,
        changedLineItems: lineItemDiffs.filter(d => d.diffType === 'CHANGED').length,
        unchangedLineItems: lineItemDiffs.filter(d => d.diffType === 'UNCHANGED').length,
        removedLineItems: lineItemDiffs.filter(d => d.diffType === 'REMOVED').length
    };

    return {
        diffType: invoiceDiffType,
        invoiceNumber: parsedInvoice.invoiceNumber,
        vendor: parsedInvoice.vendor,
        existing: existingInvoice ? {
            id: existingInvoice.id,
            invoiceDate: existingInvoice.invoiceDate,
            totalAmount: existingInvoice.totalAmount,
            status: existingInvoice.status,
            lineItemCount: existingLineItems.length
        } : null,
        incoming: {
            invoiceDate: parsedInvoice.invoiceDate,
            totalAmount: parsedInvoice.totalAmount,
            isVoided: parsedInvoice.isVoided,
            paidDate: parsedInvoice.paidDate,
            lineItemCount: parsedInvoice.lineItems.length
        },
        lineItemDiffs,
        stats,
        // Voided invoices are selected by default (import as unpaid)
        selected: invoiceDiffType !== 'UNCHANGED',
        mergeStrategy: 'csv_wins',
        // Default voided action: import as unpaid (accrued debt)
        voidedAction: 'import_unpaid'
    };
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { csvData, filename } = body;

        if (!csvData || !Array.isArray(csvData)) {
            return NextResponse.json(
                { error: 'Invalid CSV data' },
                { status: 400 }
            );
        }

        console.log(`[ImportAnalyze] Analyzing ${csvData.length} rows from ${filename}`);

        // Parse CSV data
        const { lineItems, invoices, vendors } = parseImportCSV(csvData);

        console.log(`[ImportAnalyze] Parsed ${invoices.length} invoices, ${lineItems.length} line items`);

        // Analyze vendors
        const vendorAnalysis = await Promise.all(
            vendors.map(async (vendorName) => {
                const existing = await db.vendors.findByName(vendorName);
                return {
                    name: vendorName,
                    isNew: !existing,
                    invoiceCount: invoices.filter(inv => inv.vendor === vendorName).length
                };
            })
        );

        // Analyze each invoice
        const invoiceDiffs: InvoiceDiff[] = [];
        const warnings: string[] = [];

        for (const parsedInvoice of invoices) {
            // Look up existing invoice
            const existingInvoice = await db.invoices.findByNumber(parsedInvoice.invoiceNumber);

            // Get existing line items if invoice exists
            let existingLineItems: any[] = [];
            if (existingInvoice) {
                existingLineItems = await db.invoices.getLineItems(existingInvoice.id);
            }

            const diff = await analyzeInvoice(parsedInvoice, existingInvoice, existingLineItems);
            invoiceDiffs.push(diff);

            // Add warnings
            if (parsedInvoice.isVoided) {
                warnings.push(`Invoice #${parsedInvoice.invoiceNumber} is pending (not yet processed by accounting)`);
            }

            // Check for negative amounts
            const negativeItems = parsedInvoice.lineItems.filter(item => item.totalPrice < 0);
            if (negativeItems.length > 0) {
                warnings.push(
                    `Invoice #${parsedInvoice.invoiceNumber} has ${negativeItems.length} credit/adjustment line items`
                );
            }
        }

        // Build summary
        const summary = {
            totalInvoices: invoiceDiffs.length,
            newInvoices: invoiceDiffs.filter(d => d.diffType === 'NEW').length,
            updatedInvoices: invoiceDiffs.filter(d => d.diffType === 'CHANGED').length,
            unchangedInvoices: invoiceDiffs.filter(d => d.diffType === 'UNCHANGED').length,
            voidedInvoices: invoiceDiffs.filter(d => d.diffType === 'VOIDED').length,
            totalLineItems: lineItems.length,
            newLineItems: invoiceDiffs.reduce((sum, inv) => sum + inv.stats.newLineItems, 0),
            changedLineItems: invoiceDiffs.reduce((sum, inv) => sum + inv.stats.changedLineItems, 0),
            unchangedLineItems: invoiceDiffs.reduce((sum, inv) => sum + inv.stats.unchangedLineItems, 0),
            removedLineItems: invoiceDiffs.reduce((sum, inv) => sum + inv.stats.removedLineItems, 0)
        };

        const analysis: ImportAnalysis = {
            filename: filename || 'import.csv',
            analyzedAt: new Date().toISOString(),
            summary,
            vendors: vendorAnalysis,
            invoiceDiffs,
            warnings
        };

        console.log(`[ImportAnalyze] Analysis complete:`, summary);

        return NextResponse.json(analysis);
    } catch (error) {
        console.error('[ImportAnalyze] Error:', error);
        return NextResponse.json(
            { error: 'Analysis failed', details: (error as Error).message },
            { status: 500 }
        );
    }
}
