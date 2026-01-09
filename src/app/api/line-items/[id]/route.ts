import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/line-items/[id] - Get line item details
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const lineItem = await db.lineItems.findById(params.id);
    if (!lineItem) {
        return NextResponse.json({ error: 'Line item not found' }, { status: 404 });
    }
    return NextResponse.json(lineItem);
}

// PUT /api/line-items/[id] - Update line item
export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const body = await request.json();
    const lineItem = await db.lineItems.update(params.id, body);
    if (!lineItem) {
        return NextResponse.json({ error: 'Failed to update line item' }, { status: 500 });
    }
    return NextResponse.json(lineItem);
}

// DELETE /api/line-items/[id] - Delete line item
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const success = await db.lineItems.delete(params.id);
    if (!success) {
        return NextResponse.json({ error: 'Failed to delete line item' }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: 'Line item deleted' });
}
