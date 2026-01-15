import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET() {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const data = await db.subscriptions.findAll();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const body = await request.json();
        const newSubscription = await db.subscriptions.create(body);
        return NextResponse.json(newSubscription, { status: 201 });
    } catch (error) {
        console.error('API Error:', error);
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
