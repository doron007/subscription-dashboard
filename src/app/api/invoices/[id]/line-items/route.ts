import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/invoices/[id]/line-items
 * Returns all line items for an invoice.
 */
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const lineItems = await db.invoices.getLineItems(params.id);
        return NextResponse.json(lineItems);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch invoice line items' }, { status: 500 });
    }
}
