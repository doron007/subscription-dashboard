import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/subscriptions/[id]/services
 * Returns all services for a subscription.
 */
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const services = await db.services.findBySubscription(params.id);
        return NextResponse.json(services);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 });
    }
}
