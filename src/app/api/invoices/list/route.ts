import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
    try {
        const invoices = await db.invoices.findAll();
        return NextResponse.json(invoices);
    } catch (error) {
        console.error('[InvoicesAPI] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
    }
}
