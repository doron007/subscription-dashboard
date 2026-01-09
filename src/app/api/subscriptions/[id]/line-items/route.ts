import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const lineItems = await db.invoices.getAllLineItemsBySubscription(params.id);
        return NextResponse.json(lineItems);
    } catch (error) {
        console.error('[LineItemsAPI] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch line items' }, { status: 500 });
    }
}
