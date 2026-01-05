import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const subscription = await db.subscriptions.findById(params.id);
        if (!subscription) {
            return NextResponse.json(
                { error: 'Subscription not found' },
                { status: 404 }
            );
        }
        return NextResponse.json(subscription);
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to fetch subscription' },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const body = await request.json();
        const updatedSubscription = await db.subscriptions.update(params.id, body);
        return NextResponse.json(updatedSubscription);
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to update subscription' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const success = await db.subscriptions.delete(params.id);
        if (!success) {
            return NextResponse.json(
                { error: 'Failed to delete subscription' },
                { status: 500 }
            );
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to delete subscription' },
            { status: 500 }
        );
    }
}
