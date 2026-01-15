import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AnalyzedInvoice } from '@/lib/analysis/types';
import { requireAuth } from '@/lib/api-auth';

export async function GET() {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const invoices = await db.invoices.findAll();
        return NextResponse.json(invoices);
    } catch (error) {
        console.error('[InvoicesAPI] GET Error:', error);
        return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
    }
}

// Generate logo URL from vendor website or name using Google Favicons API
function generateLogoUrl(website?: string, name?: string): string {
    // Try to extract domain from website URL
    if (website) {
        try {
            const url = new URL(website.startsWith('http') ? website : `https://${website}`);
            return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`;
        } catch {
            // Invalid URL, fall through to name-based approach
        }
    }

    // Fallback: derive domain from vendor name
    if (name) {
        const domain = name.replace(/\s+/g, '').toLowerCase() + '.com';
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    }

    // Last resort: empty string (UI will show initials fallback)
    return '';
}

// Sanitize numeric values from AI extraction
// Handles: "($ 63.02)" -> -63.02, "$1,234.56" -> 1234.56, null -> 0
function sanitizeNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return isNaN(value) ? 0 : value;
    if (typeof value !== 'string') return 0;

    const str = value.trim();
    const isNegative = str.startsWith('(') && str.endsWith(')') || str.startsWith('-');

    // Remove currency symbols, commas, parentheses, spaces
    const cleaned = str.replace(/[($)\s,]/g, '').replace(/^-/, '');
    const num = parseFloat(cleaned);

    if (isNaN(num)) return 0;
    return isNegative ? -Math.abs(num) : num;
}

export async function POST(request: Request) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const body = await request.json();
        const { analysis } = body as { analysis: AnalyzedInvoice };

        if (!analysis || !analysis.vendor || !analysis.invoice) {
            return NextResponse.json({ error: 'Invalid invoice data' }, { status: 400 });
        }

        console.log(`[InvoiceAPI] Creating invoice for vendor: ${analysis.vendor.name}`);

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
            console.log(`[InvoiceAPI] Created new vendor: ${vendor.id}`);
        } else {
            // Update logo if vendor exists but doesn't have one
            if (!vendor.logoUrl && vendorLogoUrl) {
                const updatedVendor = await db.vendors.update(vendor.id, { logoUrl: vendorLogoUrl });
                if (updatedVendor) {
                    vendor = updatedVendor;
                }
            }
            console.log(`[InvoiceAPI] Found existing vendor: ${vendor.id}`);
        }

        // 2. Find or Create Agreement (Subscription)
        // We need an Agreement to attach Services to.
        let subscription = await db.subscriptions.findLatestByVendor(vendor.id);

        if (!subscription) {
            console.log(`[InvoiceAPI] No existing agreement found. Creating 'Master Agreement'.`);
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
        console.log(`[InvoiceAPI] Looking for invoice number: ${analysis.invoice.number}`);
        let invoice = await db.invoices.findByNumber(analysis.invoice.number);

        if (invoice) {
            // Invoice already exists - update it and delete old data for clean re-import
            console.log(`[InvoiceAPI] Found existing invoice ${invoice.id}, updating...`);
            const updatePayload = {
                invoiceDate: analysis.invoice.date,
                totalAmount: sanitizeNumber(analysis.invoice.total_amount),
                currency: analysis.invoice.currency || 'USD',
                status: 'Paid' as const
            };
            console.log(`[InvoiceAPI] Update payload:`, JSON.stringify(updatePayload));
            invoice = await db.invoices.update(invoice.id, updatePayload);
            console.log(`[InvoiceAPI] Invoice updated successfully`);

            // Delete existing line items so we can re-create them
            await db.invoices.deleteLineItems(invoice.id);
            console.log(`[InvoiceAPI] Deleted old line items`);

            // Delete existing services for this subscription to avoid duplicates
            const deletedServices = await db.services.deleteBySubscription(subscriptionId);
            console.log(`[InvoiceAPI] Deleted ${deletedServices} old services, will re-create...`);
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
            console.log(`[InvoiceAPI] Created new invoice: ${invoice.id}`);
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
                    // Keep the first unit price or average later
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
                // Use total amount as the "price" for display (since this is what was billed)
                // Set quantity to 1 so that: 1 × totalAmount = correct service total
                const service = await db.services.upsert({
                    subscriptionId: subscriptionId,
                    name: serviceName,
                    currentQuantity: 1, // Always 1 for aggregated services
                    currentUnitPrice: aggregated.totalAmount, // Store total as the "price" for this service
                    currency: analysis.invoice.currency
                }, invoiceDate); // Pass invoice date for date-aware updates

                if (service) {
                    serviceMap.set(serviceName, { id: service.id });
                }
            }

            // Third pass: Create individual line items (preserving original detail)
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
    } catch (error) {
        console.error('[InvoiceAPI] Error:', error);
        console.error('[InvoiceAPI] Stack:', (error as Error).stack);
        return NextResponse.json({ error: 'Internal Server Error', details: (error as Error).message }, { status: 500 });
    }
}
