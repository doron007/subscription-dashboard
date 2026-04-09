import { NextResponse } from 'next/server';
import { createDb } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/subscriptions/[id]/invoices
 * Returns all invoices for a subscription.
 */
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    const { response, supabase } = await requireAuth();
    if (response) return response;
    const db = createDb(supabase!);

    try {
        const invoices = await db.invoices.findBySubscription(params.id);
        return NextResponse.json(invoices);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
    }
}
