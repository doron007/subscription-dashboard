import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/vendors
 * Returns all vendors.
 */
export async function GET() {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const vendors = await db.vendors.findAll();
        return NextResponse.json(vendors);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 });
    }
}
