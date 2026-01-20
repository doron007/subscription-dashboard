import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { parseImportCSV, extractPeriodFromDescription, extractCleanServiceName } from '@/lib/import/parseCSV';
import { analyzeCSVFormat, transformToStandard } from '@/lib/import/smartMapper';
import type {
    ImportExecutionResult,
    ImportDecision,
    ParsedInvoice,
    MergeStrategy,
    ImportAction
} from '@/lib/import/types';

// Generate logo URL from vendor name
function generateLogoUrl(name: string): string {
    const domain = name.replace(/\s+/g, '').toLowerCase() + '.com';
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

// Convert service month name to date (first of month)
function parseServiceMonth(serviceMonth: string, referenceYear: number): string | null {
    const monthMap: Record<string, number> = {
        'jan': 1, 'january': 1,
        'feb': 2, 'february': 2,
        'mar': 3, 'march': 3,
        'apr': 4, 'april': 4,
        'may': 5,
        'jun': 6, 'june': 6,
        'jul': 7, 'july': 7,
        'aug': 8, 'august': 8,
        'sep': 9, 'sept': 9, 'september': 9,
        'oct': 10, 'october': 10,
        'nov': 11, 'november': 11,
        'dec': 12, 'december': 12
    };

    const monthNum = monthMap[serviceMonth.toLowerCase()];
    if (!monthNum) return null;

    // Use reference year from invoice date
    const month = monthNum.toString().padStart(2, '0');
    return `${referenceYear}-${month}-01`;
}

interface BatchRequest {
    csvData: any[];
    decisions: ImportDecision[];
    globalStrategy: MergeStrategy;
    batchIndex: number;
    batchSize: number;
    totalBatches: number;
}

/**
 * POST /api/import/execute-batch
 * Executes a single batch of CSV data import.
 * This endpoint is designed to be called multiple times for large imports.
 */
export async function POST(request: Request) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const body = await request.json();
        const { csvData, decisions, globalStrategy = 'csv_wins', batchIndex, batchSize, totalBatches } = body as BatchRequest;

        if (!csvData || !Array.isArray(csvData)) {
            return NextResponse.json(
                { error: 'Invalid CSV data' },
                { status: 400 }
            );
        }

        // Get headers and detect format
        const headers = csvData.length > 0 ? Object.keys(csvData[0]) : [];
        const lowerHeaders = headers.map(h => h.toLowerCase().trim());
        const isLegacyFormat = lowerHeaders.includes('vendor') &&
            lowerHeaders.includes('invoice') &&
            lowerHeaders.some(h => h.includes('line item'));

        let invoices: ParsedInvoice[];

        if (isLegacyFormat) {
            const parsed = parseImportCSV(csvData);
            invoices = parsed.invoices;
        } else {
            // Use smart mapping for non-legacy formats
            const mappingResult = await analyzeCSVFormat(headers, csvData.slice(0, 10));

            const standardItems = transformToStandard(csvData, mappingResult.mapping, mappingResult.transformRules);

            // Convert to ParsedInvoice format
            const invoiceMap = new Map<string, ParsedInvoice>();
            for (const item of standardItems) {
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
                invoice.totalAmount += item.totalPrice;
                invoice.lineItems.push({
                    vendor: item.vendor,
                    invoiceNumber: item.invoiceNumber,
                    invoiceDate: item.invoiceDate,
                    serviceMonth: item.serviceMonth,
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    totalPrice: item.totalPrice,
                    paidDate: item.paidDate,
                    isVoided: item.isVoided,
                    lineItemKey: `${item.invoiceNumber}|${item.description}|${item.serviceMonth}`
                });
            }
            invoices = Array.from(invoiceMap.values());
        }

        // Calculate batch slice
        const startIdx = batchIndex * batchSize;
        const endIdx = Math.min(startIdx + batchSize, invoices.length);
        const batchInvoices = invoices.slice(startIdx, endIdx);

        // Build decision map for quick lookup
        const decisionMap = new Map<string, ImportDecision>();
        for (const decision of decisions || []) {
            decisionMap.set(decision.invoiceNumber, decision);
        }

        // Results tracking
        const result: ImportExecutionResult & { batchIndex: number; totalBatches: number; processedInBatch: number } = {
            success: true,
            created: { vendors: 0, invoices: 0, lineItems: 0, services: 0 },
            updated: { invoices: 0, lineItems: 0 },
            skipped: { invoices: 0, lineItems: 0 },
            errors: [],
            batchIndex,
            totalBatches,
            processedInBatch: batchInvoices.length
        };

        // Pre-fetch data in batch for efficiency
        const vendorNames = [...new Set(batchInvoices.map(inv => inv.vendor))];
        const invoiceNumbers = batchInvoices.map(inv => inv.invoiceNumber);

        // Batch lookup vendors
        const existingVendorsMap = await db.vendors.findByNames(vendorNames);

        // Batch lookup invoices
        const existingInvoicesMap = await db.invoices.findByNumbers(invoiceNumbers);

        // Cache for created/found vendors and subscriptions during this batch
        const vendorCache = new Map<string, any>();

        // ===== PHASE 1: Ensure all vendors exist =====
        for (const parsedInvoice of batchInvoices) {
            const vendorKey = parsedInvoice.vendor.toLowerCase();
            if (!vendorCache.has(vendorKey)) {
                let vendor = existingVendorsMap.get(vendorKey);
                if (!vendor) {
                    vendor = await db.vendors.create({
                        name: parsedInvoice.vendor,
                        logoUrl: generateLogoUrl(parsedInvoice.vendor)
                    });
                    result.created.vendors++;
                }
                vendorCache.set(vendorKey, vendor);
            }
        }

        // ===== PHASE 2: Batch fetch subscriptions for all vendors =====
        const vendorIds = [...vendorCache.values()].map(v => v.id);
        const existingSubscriptionsMap = await db.subscriptions.findByVendorIds(vendorIds);
        const subscriptionCache = new Map<string, any>();

        // Create missing subscriptions
        for (const [, vendor] of vendorCache) {
            let subscription = existingSubscriptionsMap.get(vendor.id);
            if (!subscription) {
                const created = await db.subscriptions.create({
                    vendorId: vendor.id,
                    name: `${vendor.name} Master Agreement`,
                    status: 'Active',
                    billingCycle: 'Monthly',
                    paymentMethod: 'Invoice',
                    logo: vendor.logoUrl
                });
                if (created) {
                    subscription = created;
                }
            }
            if (subscription) {
                subscriptionCache.set(vendor.id, subscription);
            }
        }

        // ===== PHASE 3: Process invoices and collect all service data =====
        // Collect all services across the entire batch for a single batch upsert
        const allServicesToUpsert: Array<{
            subscriptionId: string;
            name: string;
            currentQuantity: number;
            currentUnitPrice: number;
            currency: string;
        }> = [];

        // Track invoice-to-lineItems mapping for later processing
        const invoiceLineItemsMap = new Map<string, {
            invoice: any;
            lineItems: any[];
            subscription: any;
            invoiceDate: Date;
        }>();

        // Use the most recent invoice date for the batch service upsert
        let latestInvoiceDate = new Date(0);

        for (const parsedInvoice of batchInvoices) {
            try {
                const decision = decisionMap.get(parsedInvoice.invoiceNumber);

                // Skip if explicitly marked to skip
                // For voided/pending invoices, check if user chose to import them
                const shouldSkipVoided = parsedInvoice.isVoided && decision?.action !== 'import';
                if (decision?.action === 'skip' || shouldSkipVoided) {
                    result.skipped.invoices++;
                    result.skipped.lineItems += parsedInvoice.lineItems.length;
                    continue;
                }

                // Determine merge strategy for this invoice
                const mergeStrategy = decision?.mergeStrategy || globalStrategy;

                // Get vendor and subscription from caches
                const vendorKey = parsedInvoice.vendor.toLowerCase();
                const vendor = vendorCache.get(vendorKey)!;
                const subscription = subscriptionCache.get(vendor.id)!;

                if (!subscription) {
                    throw new Error(`Failed to get subscription for vendor ${vendor.name}`);
                }

                // Check for existing invoice (use batch lookup result)
                let invoice = existingInvoicesMap.get(parsedInvoice.invoiceNumber) || null;
                const invoiceDate = parsedInvoice.invoiceDate
                    ? new Date(parsedInvoice.invoiceDate)
                    : new Date();

                if (invoiceDate > latestInvoiceDate) {
                    latestInvoiceDate = invoiceDate;
                }

                // Track if this is an update scenario (invoice existed and we're doing csv_wins)
                const isUpdatingExisting = invoice && mergeStrategy === 'csv_wins';

                if (invoice) {
                    // Invoice exists - handle based on action/strategy
                    const shouldSkip = decision?.action === ('skip' as ImportAction) || mergeStrategy === 'keep_existing';
                    if (shouldSkip) {
                        result.skipped.invoices++;
                        result.skipped.lineItems += parsedInvoice.lineItems.length;
                        continue;
                    }

                    // Update invoice
                    if (mergeStrategy === 'csv_wins') {
                        await db.invoices.update(invoice.id, {
                            invoiceDate: parsedInvoice.invoiceDate,
                            totalAmount: parsedInvoice.totalAmount,
                            status: parsedInvoice.paidDate ? 'Paid' : 'Pending'
                        });
                        result.updated.invoices++;

                        // Delete existing line items for clean re-import
                        await db.invoices.deleteLineItems(invoice.id);
                    }
                } else {
                    // Create new invoice
                    invoice = await db.invoices.create({
                        vendorId: vendor.id,
                        subscriptionId: subscription.id,
                        invoiceNumber: parsedInvoice.invoiceNumber,
                        invoiceDate: parsedInvoice.invoiceDate,
                        totalAmount: parsedInvoice.totalAmount,
                        currency: 'USD',
                        status: parsedInvoice.paidDate ? 'Paid' : 'Pending'
                    });
                    result.created.invoices++;
                }

                // Build line item decision map
                const lineItemDecisionMap = new Map<string, { action: string; mergeStrategy: MergeStrategy }>();
                for (const liDecision of decision?.lineItemDecisions || []) {
                    lineItemDecisionMap.set(liDecision.lineItemKey, {
                        action: liDecision.action,
                        mergeStrategy: liDecision.mergeStrategy
                    });
                }

                // Aggregate services by name for this invoice
                const serviceAggregates = new Map<string, {
                    totalAmount: number;
                    quantity: number;
                }>();

                // First pass: aggregate and filter line items
                const lineItemsToCreate: any[] = [];

                for (const item of parsedInvoice.lineItems) {
                    const liDecision = lineItemDecisionMap.get(item.lineItemKey);

                    // For existing invoices being updated (csv_wins), include ALL items from CSV
                    // since we deleted existing line items and need to re-create them all.
                    // For new invoices, respect user selections.
                    if (!isUpdatingExisting && liDecision?.action === 'skip') {
                        result.skipped.lineItems++;
                        continue;
                    }

                    // Extract clean service name from description (strips date suffixes)
                    const serviceName = extractCleanServiceName(item.description);

                    // Aggregate for service creation
                    if (serviceAggregates.has(serviceName)) {
                        const existing = serviceAggregates.get(serviceName)!;
                        existing.totalAmount += item.totalPrice;
                        existing.quantity += item.quantity;
                    } else {
                        serviceAggregates.set(serviceName, {
                            totalAmount: item.totalPrice,
                            quantity: item.quantity
                        });
                    }

                    // Extract period from description
                    const period = extractPeriodFromDescription(item.description);

                    // Parse service month from CSV for billing_month_override
                    const invoiceYear = invoiceDate.getFullYear();
                    const billingMonthOverride = item.serviceMonth
                        ? parseServiceMonth(item.serviceMonth, invoiceYear)
                        : null;

                    lineItemsToCreate.push({
                        invoiceId: invoice.id,
                        description: item.description,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        totalAmount: item.totalPrice,
                        periodStart: period?.periodStart,
                        periodEnd: period?.periodEnd,
                        billingMonthOverride,
                        serviceName // For linking later
                    });
                }

                // Collect services for batch upsert
                for (const [serviceName, aggregate] of serviceAggregates) {
                    allServicesToUpsert.push({
                        subscriptionId: subscription.id,
                        name: serviceName,
                        currentQuantity: 1, // Aggregated
                        currentUnitPrice: aggregate.totalAmount,
                        currency: 'USD'
                    });
                }

                // Store for later line item creation
                invoiceLineItemsMap.set(parsedInvoice.invoiceNumber, {
                    invoice,
                    lineItems: lineItemsToCreate,
                    subscription,
                    invoiceDate
                });

            } catch (invoiceError) {
                result.errors.push(`Invoice ${parsedInvoice.invoiceNumber}: ${(invoiceError as Error).message}`);
            }
        }

        // ===== PHASE 4: Batch upsert all services at once =====
        let serviceIdMap = new Map<string, string>();
        if (allServicesToUpsert.length > 0) {
            serviceIdMap = await db.services.batchUpsert(
                allServicesToUpsert,
                latestInvoiceDate.getTime() > 0 ? latestInvoiceDate : new Date()
            );
            result.created.services = serviceIdMap.size;
        }

        // ===== PHASE 5: Create all line items with service IDs =====
        for (const [_invoiceNumber, data] of invoiceLineItemsMap) {
            const dbLineItems = data.lineItems.map(item => ({
                invoiceId: item.invoiceId,
                serviceId: serviceIdMap.get(item.serviceName),
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalAmount: item.totalAmount,
                periodStart: item.periodStart,
                periodEnd: item.periodEnd,
                billingMonthOverride: item.billingMonthOverride
            }));

            if (dbLineItems.length > 0) {
                await db.invoices.addLineItems(dbLineItems);
                result.created.lineItems += dbLineItems.length;
            }
        }

        result.success = result.errors.length === 0;

        return NextResponse.json(result);
    } catch (error) {
        console.error('Batch import error:', error);
        return NextResponse.json(
            { error: 'Batch import failed', details: (error as Error).message },
            { status: 500 }
        );
    }
}
