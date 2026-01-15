import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/**
 * POST /api/subscriptions/bulk
 * Bulk creates multiple subscriptions from an array.
 */
export async function POST(request: Request) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const body = await request.json();

        if (!Array.isArray(body)) {
            return NextResponse.json({ error: 'Body must be an array' }, { status: 400 });
        }

        const success = await db.subscriptions.createMany(body);
        if (!success) {
            return NextResponse.json({ error: 'Failed to import subscriptions' }, { status: 500 });
        }

        return NextResponse.json({ success: true, count: body.length }, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Failed to import subscriptions' }, { status: 500 });
    }
}
