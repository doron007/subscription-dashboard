import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, requireAdmin } from '@/lib/api-auth';

/**
 * GET /api/subscriptions/[id]
 * Returns subscription details by ID.
 */
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const subscription = await db.subscriptions.findById(params.id);
        if (!subscription) {
            return NextResponse.json(
                { error: 'Subscription not found' },
                { status: 404 }
            );
        }
        return NextResponse.json(subscription);
    } catch {
        return NextResponse.json(
            { error: 'Failed to fetch subscription' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/subscriptions/[id]
 * Updates subscription details.
 */
export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const body = await request.json();
        const updatedSubscription = await db.subscriptions.update(params.id, body);
        return NextResponse.json(updatedSubscription);
    } catch {
        return NextResponse.json(
            { error: 'Failed to update subscription' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/subscriptions/[id]
 * Deletes a subscription. Requires admin access.
 */
export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    const { response } = await requireAdmin();
    if (response) return response;

    try {
        const success = await db.subscriptions.delete(params.id);
        if (!success) {
            return NextResponse.json(
                { error: 'Failed to delete subscription' },
                { status: 500 }
            );
        }
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json(
            { error: 'Failed to delete subscription' },
            { status: 500 }
        );
    }
}
