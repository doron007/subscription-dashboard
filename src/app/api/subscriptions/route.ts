import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
    try {
        const data = await db.subscriptions.findAll();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
    }
}

export async function POST(request: Request) {
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
