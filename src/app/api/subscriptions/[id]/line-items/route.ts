import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/subscriptions/[id]/line-items
 * Returns all line items across all invoices for a subscription.
 */
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const lineItems = await db.invoices.getAllLineItemsBySubscription(params.id);
        return NextResponse.json(lineItems);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch line items' }, { status: 500 });
    }
}
