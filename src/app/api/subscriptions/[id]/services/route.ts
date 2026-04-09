import { NextResponse } from 'next/server';
import { createDb } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/subscriptions/[id]/services
 * Returns all services for a subscription.
 */
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    const { response, supabase } = await requireAuth();
    if (response) return response;
    const db = createDb(supabase!);

    try {
        const services = await db.services.findBySubscription(params.id);
        return NextResponse.json(services);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 });
    }
}
