import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AnalyzedInvoice } from '@/lib/analysis/types';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/invoices
 * Returns all invoices.
 */
export async function GET() {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const invoices = await db.invoices.findAll();
        return NextResponse.json(invoices);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
    }
}

/**
 * Generates a logo URL using Google Favicons API.
 */
function generateLogoUrl(website?: string, name?: string): string {
    if (website) {
        try {
            const url = new URL(website.startsWith('http') ? website : `https://${website}`);
            return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`;
        } catch {
            // Invalid URL, fall through to name-based approach
        }
    }

    if (name) {
        const domain = name.replace(/\s+/g, '').toLowerCase() + '.com';
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    }

    return '';
}

/**
 * Sanitizes numeric values from AI extraction.
 * Handles formats like "($ 63.02)" -> -63.02, "$1,234.56" -> 1234.56
 */
function sanitizeNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return isNaN(value) ? 0 : value;
    if (typeof value !== 'string') return 0;

    const str = value.trim();
    const isNegative = str.startsWith('(') && str.endsWith(')') || str.startsWith('-');

    const cleaned = str.replace(/[($)\s,]/g, '').replace(/^-/, '');
    const num = parseFloat(cleaned);

    if (isNaN(num)) return 0;
    return isNegative ? -Math.abs(num) : num;
}

/**
 * POST /api/invoices
 * Creates or updates an invoice from AI-analyzed data.
 * Handles vendor creation, service aggregation, and line item processing.
 */
export async function POST(request: Request) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const body = await request.json();
        const { analysis } = body as { analysis: AnalyzedInvoice };

        if (!analysis || !analysis.vendor || !analysis.invoice) {
            return NextResponse.json({ error: 'Invalid invoice data' }, { status: 400 });
        }

        // 1. Create or Find Vendor
        const vendorLogoUrl = generateLogoUrl(analysis.vendor.website, analysis.vendor.name);
        let vendor = await db.vendors.findByName(analysis.vendor.name);
        if (!vendor) {
            vendor = await db.vendors.create({
                name: analysis.vendor.name,
                contactEmail: analysis.vendor.contact_email,
                website: analysis.vendor.website,
                logoUrl: vendorLogoUrl
            });
        } else {
            // Update logo if vendor exists but doesn't have one
            if (!vendor.logoUrl && vendorLogoUrl) {
                const updatedVendor = await db.vendors.update(vendor.id, { logoUrl: vendorLogoUrl });
                if (updatedVendor) {
                    vendor = updatedVendor;
                }
            }
        }

        // 2. Find or Create Agreement (Subscription)
        let subscription = await db.subscriptions.findLatestByVendor(vendor.id);

        if (!subscription) {
            subscription = await db.subscriptions.create({
                vendorId: vendor.id,
                name: `${vendor.name} Master Agreement`,
                status: 'Active',
                billingCycle: 'Monthly',
                paymentMethod: 'Invoice',
                logo: vendorLogoUrl
            });
        }

        if (!subscription) {
            throw new Error("Failed to create or find subscription agreement.");
        }

        const subscriptionId = subscription.id;

        // Check for existing invoice by invoice number (idempotency)
        let invoice = await db.invoices.findByNumber(analysis.invoice.number);

        if (invoice) {
            // Invoice already exists - update it and delete old data for clean re-import
            const updatePayload = {
                invoiceDate: analysis.invoice.date,
                totalAmount: sanitizeNumber(analysis.invoice.total_amount),
                currency: analysis.invoice.currency || 'USD',
                status: 'Paid' as const
            };
            invoice = await db.invoices.update(invoice.id, updatePayload);

            // Delete existing line items so we can re-create them
            await db.invoices.deleteLineItems(invoice.id);

            // Delete existing services for this subscription to avoid duplicates
            await db.services.deleteBySubscription(subscriptionId);
        } else {
            // Create new invoice
            invoice = await db.invoices.create({
                vendorId: vendor.id,
                subscriptionId: subscriptionId,
                invoiceNumber: analysis.invoice.number,
                invoiceDate: analysis.invoice.date,
                totalAmount: sanitizeNumber(analysis.invoice.total_amount),
                currency: analysis.invoice.currency,
                status: 'Paid',
                fileUrl: 'placeholder_url'
            });
        }

        // 3. Process Line Items -> Services & Invoice Items
        if (analysis.line_items && analysis.line_items.length > 0) {
            const dbLineItems = [];

            // Parse invoice date for comparison
            const invoiceDate = analysis.invoice.date ? new Date(analysis.invoice.date) : new Date();

            // First pass: Aggregate line items by service name
            const aggregatedServices = new Map<string, {
                quantity: number;
                totalAmount: number;
                unitPrice: number;
                itemCount: number;
            }>();

            for (const item of analysis.line_items) {
                const quantity = sanitizeNumber(item.quantity) || 1;
                const unitPrice = sanitizeNumber(item.unit_price);
                const totalAmount = sanitizeNumber(item.total_amount) || unitPrice * quantity;
                const serviceName = item.service_name || item.description || 'Unknown Service';

                if (aggregatedServices.has(serviceName)) {
                    const existing = aggregatedServices.get(serviceName)!;
                    existing.quantity += quantity;
                    existing.totalAmount += totalAmount;
                    existing.itemCount += 1;
                } else {
                    aggregatedServices.set(serviceName, {
                        quantity,
                        totalAmount,
                        unitPrice,
                        itemCount: 1
                    });
                }
            }

            // Second pass: Upsert aggregated services
            const serviceMap = new Map<string, { id: string }>();
            for (const [serviceName, aggregated] of aggregatedServices) {
                const service = await db.services.upsert({
                    subscriptionId: subscriptionId,
                    name: serviceName,
                    currentQuantity: 1,
                    currentUnitPrice: aggregated.totalAmount,
                    currency: analysis.invoice.currency
                }, invoiceDate);

                if (service) {
                    serviceMap.set(serviceName, { id: service.id });
                }
            }

            // Third pass: Create individual line items
            for (const item of analysis.line_items) {
                const quantity = sanitizeNumber(item.quantity) || 1;
                const unitPrice = sanitizeNumber(item.unit_price);
                const totalAmount = sanitizeNumber(item.total_amount) || unitPrice * quantity;
                const serviceName = item.service_name || item.description || 'Unknown Service';

                const service = serviceMap.get(serviceName);

                dbLineItems.push({
                    invoiceId: invoice.id,
                    serviceId: service?.id,
                    description: item.description || 'Line Item',
                    quantity: quantity,
                    unitPrice: unitPrice || totalAmount,
                    totalAmount: totalAmount,
                    periodStart: item.period_start,
                    periodEnd: item.period_end
                });
            }

            // Batch create line items
            await db.invoices.addLineItems(dbLineItems);
        }

        return NextResponse.json({ success: true, invoice });
    } catch {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
