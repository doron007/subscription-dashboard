import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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
