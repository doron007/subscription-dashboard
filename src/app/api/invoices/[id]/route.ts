import { NextResponse } from 'next/server';
import { createDb } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/**
 * PUT /api/invoices/[id]
 * Updates invoice details.
 */
export async function PUT(
    _request: Request,
    { params }: { params: { id: string } }
) {
    const { response, supabase } = await requireAuth();
    if (response) return response;
    const db = createDb(supabase!);

    try {
        const body = await _request.json();
        const updatedInvoice = await db.invoices.update(params.id, body);

        if (!updatedInvoice) {
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
        }

        return NextResponse.json(updatedInvoice);
    } catch {
        return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
    }
}

/**
 * DELETE /api/invoices/[id]
 * Deletes an invoice.
 */
export async function DELETE(
    _request: Request,
    { params }: { params: { id: string } }
) {
    const { response, supabase } = await requireAuth();
    if (response) return response;
    const db = createDb(supabase!);

    try {
        await db.invoices.delete(params.id);
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 });
    }
}
