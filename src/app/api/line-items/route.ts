import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createClient } from '@/lib/supabase/client';
import { resolveBillingMonth, parsePeriodFromDescription } from '@/lib/periodParser';
import { format } from 'date-fns';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/line-items
 * Returns all line items with invoice info and resolved billing month.
 */
export async function GET() {
    const { response } = await requireAuth();
    if (response) return response;

    const supabase = createClient();
    try {
        const { data, error } = await supabase
            .from('sub_invoice_line_items')
            .select(`
                id,
                description,
                quantity,
                unit_price,
                total_amount,
                period_start,
                period_end,
                billing_month_override,
                invoice_id,
                invoice:sub_invoices(
                    id,
                    invoice_date,
                    invoice_number,
                    subscription_id,
                    vendor:sub_vendors(id, name)
                )
            `)
            .order('total_amount', { ascending: false });

        if (error) {
            return NextResponse.json({ error: 'Failed to fetch line items' }, { status: 500 });
        }

        const lineItems = (data || []).map((item: any) => {
            const invoiceDate = item.invoice?.invoice_date || null;
            const parsed = parsePeriodFromDescription(item.description || '');

            // Resolve billing month using priority hierarchy
            const billingMonth = resolveBillingMonth(
                item.billing_month_override,
                item.period_start,
                item.description || '',
                invoiceDate
            );

            return {
                id: item.id,
                invoiceId: item.invoice_id,
                subscriptionId: item.invoice?.subscription_id,
                description: item.description,
                quantity: item.quantity,
                unitPrice: parseFloat(item.unit_price) || 0,
                totalAmount: parseFloat(item.total_amount) || 0,
                invoiceDate,
                invoiceNumber: item.invoice?.invoice_number,
                vendorId: item.invoice?.vendor?.id,
                vendorName: item.invoice?.vendor?.name || 'Unknown Vendor',
                periodStart: item.period_start || (parsed.periodStart ? format(parsed.periodStart, 'yyyy-MM-dd') : null),
                periodEnd: item.period_end || (parsed.periodEnd ? format(parsed.periodEnd, 'yyyy-MM-dd') : null),
                billingMonthOverride: item.billing_month_override,
                billingMonth,
                isManualOverride: !!item.billing_month_override
            };
        });

        return NextResponse.json(lineItems);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch line items' }, { status: 500 });
    }
}

/**
 * POST /api/line-items
 * Creates a new line item.
 */
export async function POST(request: NextRequest) {
    const { response } = await requireAuth();
    if (response) return response;

    const body = await request.json();

    const lineItem = await db.lineItems.create({
        invoiceId: body.invoiceId,
        serviceId: body.serviceId,
        description: body.description,
        quantity: body.quantity,
        unitPrice: body.unitPrice,
        totalAmount: body.totalAmount,
        periodStart: body.periodStart,
        periodEnd: body.periodEnd
    });

    if (!lineItem) {
        return NextResponse.json({ error: 'Failed to create line item' }, { status: 500 });
    }

    return NextResponse.json(lineItem, { status: 201 });
}
