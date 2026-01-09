import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const services = await db.services.findBySubscription(params.id);
        return NextResponse.json(services);
    } catch (error) {
        console.error('[ServicesAPI] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 });
    }
}
