import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET() {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const data = await db.devices.findAll();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch devices' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const body = await request.json();
        const newDevice = await db.devices.create(body);
        return NextResponse.json(newDevice, { status: 201 });
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Failed to create device' }, { status: 500 });
    }
}
