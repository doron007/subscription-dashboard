import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const invoices = await db.invoices.findBySubscription(params.id);
        return NextResponse.json(invoices);
    } catch (error) {
        console.error('[InvoicesAPI] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
    }
}
