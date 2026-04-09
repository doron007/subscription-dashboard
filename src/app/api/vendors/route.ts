import { NextResponse } from 'next/server';
import { createDb } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/vendors
 * Returns all vendors.
 */
export async function GET() {
    const { response, supabase } = await requireAuth();
    if (response) return response;
    const db = createDb(supabase!);

    try {
        const vendors = await db.vendors.findAll();
        return NextResponse.json(vendors);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 });
    }
}
