import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/subscriptions
 * Returns all subscriptions.
 */
export async function GET() {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const data = await db.subscriptions.findAll();
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
    }
}

/**
 * POST /api/subscriptions
 * Creates a new subscription.
 */
export async function POST(request: Request) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const body = await request.json();
        const newSubscription = await db.subscriptions.create(body);
        return NextResponse.json(newSubscription, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
    }
}
