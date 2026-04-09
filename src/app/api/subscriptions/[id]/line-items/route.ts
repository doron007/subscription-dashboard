import { NextResponse } from 'next/server';
import { createDb } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/subscriptions/[id]/line-items
 * Returns all line items across all invoices for a subscription.
 */
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    const { response, supabase } = await requireAuth();
    if (response) return response;
    const db = createDb(supabase!);

    try {
        const lineItems = await db.invoices.getAllLineItemsBySubscription(params.id);
        return NextResponse.json(lineItems);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch line items' }, { status: 500 });
    }
}
