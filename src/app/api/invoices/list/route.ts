import { NextResponse } from 'next/server';
import { createDb } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/invoices/list
 * Returns all invoices with basic details.
 */
export async function GET() {
    const { response, supabase } = await requireAuth();
    if (response) return response;
    const db = createDb(supabase!);

    try {
        const invoices = await db.invoices.findAll();
        return NextResponse.json(invoices);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
    }
}
