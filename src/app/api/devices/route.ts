import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/devices
 * Returns all devices.
 */
export async function GET() {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const data = await db.devices.findAll();
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch devices' }, { status: 500 });
    }
}

/**
 * POST /api/devices
 * Creates a new device.
 */
export async function POST(request: Request) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const body = await request.json();
        const newDevice = await db.devices.create(body);
        return NextResponse.json(newDevice, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Failed to create device' }, { status: 500 });
    }
}
