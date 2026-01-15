import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/invoices/list
 * Returns all invoices with basic details.
 */
export async function GET() {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const invoices = await db.invoices.findAll();
        return NextResponse.json(invoices);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
    }
}
