import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/vendors/[id] - Get vendor details
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const vendor = await db.vendors.findById(params.id);
    if (!vendor) {
        return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }
    return NextResponse.json(vendor);
}

// PUT /api/vendors/[id] - Update vendor
export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const body = await request.json();
    const vendor = await db.vendors.update(params.id, body);
    if (!vendor) {
        return NextResponse.json({ error: 'Failed to update vendor' }, { status: 500 });
    }
    return NextResponse.json(vendor);
}

// DELETE /api/vendors/[id] - Cascade delete vendor
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    // Check for cascade impact first (for confirmation in UI)
    const url = new URL(request.url);
    const confirmDelete = url.searchParams.get('confirm') === 'true';

    if (!confirmDelete) {
        // Return impact preview
        const impact = await db.vendors.getCascadeImpact(params.id);
        return NextResponse.json({
            requiresConfirmation: true,
            impact,
            message: `This will delete ${impact.subscriptions} subscription(s), ${impact.services} service(s), ${impact.invoices} invoice(s), and ${impact.lineItems} line item(s).`
        });
    }

    // Perform cascade delete
    const result = await db.vendors.delete(params.id);
    if (!result.success) {
        return NextResponse.json({ error: 'Failed to delete vendor' }, { status: 500 });
    }
    return NextResponse.json({
        success: true,
        message: 'Vendor and all related data deleted',
        deletedCounts: result.deletedCounts
    });
}
