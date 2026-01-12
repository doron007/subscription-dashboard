import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase';

// GET /api/line-items - Get all line items with invoice info
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('sub_invoice_line_items')
            .select(`
                id,
                description,
                quantity,
                unit_price,
                total_amount,
                invoice:sub_invoices(
                    id,
                    invoice_date,
                    vendor:sub_vendors(name)
                )
            `)
            .order('total_amount', { ascending: false });

        if (error) {
            console.error('Error fetching line items:', error);
            return NextResponse.json({ error: 'Failed to fetch line items' }, { status: 500 });
        }

        const lineItems = (data || []).map((item: any) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unit_price) || 0,
            totalAmount: parseFloat(item.total_amount) || 0,
            invoiceDate: item.invoice?.invoice_date,
            vendorName: item.invoice?.vendor?.name || 'Unknown Vendor'
        }));

        return NextResponse.json(lineItems);
    } catch (error) {
        console.error('[LineItemsAPI] GET Error:', error);
        return NextResponse.json({ error: 'Failed to fetch line items' }, { status: 500 });
    }
}

// POST /api/line-items - Create new line item
export async function POST(request: NextRequest) {
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
