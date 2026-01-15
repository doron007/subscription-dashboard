import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const body = await request.json();
        const updatedInvoice = await db.invoices.update(params.id, body);

        if (!updatedInvoice) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
        }

        return NextResponse.json(updatedInvoice);
    } catch (error) {
        console.error('Failed to update invoice:', error);
        return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
    }
}
