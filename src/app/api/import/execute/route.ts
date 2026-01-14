import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseImportCSV, extractPeriodFromDescription } from '@/lib/import/parseCSV';
import type {
    ImportExecutionResult,
    ImportDecision,
    ParsedInvoice,
    MergeStrategy,
    ImportAction,
    LineItemAction
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

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { csvData, decisions, globalStrategy = 'csv_wins' } = body as {
            csvData: any[];
            decisions: ImportDecision[];
            globalStrategy: MergeStrategy;
        };

        if (!csvData || !Array.isArray(csvData)) {
            return NextResponse.json(
                { error: 'Invalid CSV data' },
                { status: 400 }
            );
        }

        console.log(`[ImportExecute] Executing import with ${decisions?.length || 0} decisions`);

        // Parse CSV data
        const { invoices } = parseImportCSV(csvData);

        // Build decision map for quick lookup
        const decisionMap = new Map<string, ImportDecision>();
        for (const decision of decisions || []) {
            decisionMap.set(decision.invoiceNumber, decision);
        }

        // Results tracking
        const result: ImportExecutionResult = {
            success: true,
            created: { vendors: 0, invoices: 0, lineItems: 0, services: 0 },
            updated: { invoices: 0, lineItems: 0 },
            skipped: { invoices: 0, lineItems: 0 },
            errors: []
        };

        // Process each invoice
        for (const parsedInvoice of invoices) {
            try {
                const decision = decisionMap.get(parsedInvoice.invoiceNumber);

                // Skip if explicitly marked to skip
                // For voided/pending invoices, check if user chose to import them
                const shouldSkipVoided = parsedInvoice.isVoided && decision?.action !== 'import';
                if (decision?.action === 'skip' || shouldSkipVoided) {
                    result.skipped.invoices++;
                    result.skipped.lineItems += parsedInvoice.lineItems.length;
                    console.log(`[ImportExecute] Skipping invoice ${parsedInvoice.invoiceNumber}`);
                    continue;
                }

                // Determine merge strategy for this invoice
                const mergeStrategy = decision?.mergeStrategy || globalStrategy;

                // 1. Create or find vendor
                let vendor = await db.vendors.findByName(parsedInvoice.vendor);
                if (!vendor) {
                    vendor = await db.vendors.create({
                        name: parsedInvoice.vendor,
                        logoUrl: generateLogoUrl(parsedInvoice.vendor)
                    });
                    result.created.vendors++;
                    console.log(`[ImportExecute] Created vendor: ${vendor.name}`);
                }

                // 2. Find or create subscription/agreement
                let subscription = await db.subscriptions.findLatestByVendor(vendor.id);
                if (!subscription) {
                    subscription = await db.subscriptions.create({
                        vendorId: vendor.id,
                        name: `${vendor.name} Master Agreement`,
                        status: 'Active',
                        billingCycle: 'Monthly',
                        paymentMethod: 'Invoice',
                        logo: vendor.logoUrl
                    });
                    console.log(`[ImportExecute] Created subscription: ${subscription?.name}`);
                }

                if (!subscription) {
                    throw new Error(`Failed to create subscription for vendor ${vendor.name}`);
                }

                // 3. Check for existing invoice
                let invoice = await db.invoices.findByNumber(parsedInvoice.invoiceNumber);
                const invoiceDate = parsedInvoice.invoiceDate
                    ? new Date(parsedInvoice.invoiceDate)
                    : new Date();

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
                        console.log(`[ImportExecute] Updated invoice: ${parsedInvoice.invoiceNumber}`);

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
                    console.log(`[ImportExecute] Created invoice: ${parsedInvoice.invoiceNumber}`);
                }

                // 4. Process line items
                const lineItemDecisionMap = new Map<string, { action: string; mergeStrategy: MergeStrategy }>();
                for (const liDecision of decision?.lineItemDecisions || []) {
                    lineItemDecisionMap.set(liDecision.lineItemKey, {
                        action: liDecision.action,
                        mergeStrategy: liDecision.mergeStrategy
                    });
                }

                // Aggregate services by name
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

                    // Extract service name from description
                    const serviceName = item.description;

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

                // Second pass: create/update services
                const serviceIdMap = new Map<string, string>();

                for (const [serviceName, aggregate] of serviceAggregates) {
                    const service = await db.services.upsert({
                        subscriptionId: subscription.id,
                        name: serviceName,
                        currentQuantity: 1, // Aggregated
                        currentUnitPrice: aggregate.totalAmount,
                        currency: 'USD'
                    }, invoiceDate);

                    if (service) {
                        serviceIdMap.set(serviceName, service.id);
                        result.created.services++; // Note: this counts upserts
                    }
                }

                // Third pass: create line items with service links
                const dbLineItems = lineItemsToCreate.map(item => ({
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

                console.log(`[ImportExecute] Processed ${dbLineItems.length} line items for invoice ${parsedInvoice.invoiceNumber}`);

            } catch (invoiceError) {
                console.error(`[ImportExecute] Error processing invoice ${parsedInvoice.invoiceNumber}:`, invoiceError);
                result.errors.push(`Invoice ${parsedInvoice.invoiceNumber}: ${(invoiceError as Error).message}`);
            }
        }

        result.success = result.errors.length === 0;

        console.log(`[ImportExecute] Import complete:`, result);

        return NextResponse.json(result);
    } catch (error) {
        console.error('[ImportExecute] Error:', error);
        return NextResponse.json(
            { error: 'Import failed', details: (error as Error).message },
            { status: 500 }
        );
    }
}
