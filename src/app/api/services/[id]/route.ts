import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, requireAdmin } from '@/lib/api-auth';

/**
 * GET /api/services/[id]
 * Returns service details by ID.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const { response } = await requireAuth();
    if (response) return response;

    const service = await db.services.findById(params.id);
    if (!service) {
        return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }
    return NextResponse.json(service);
}

/**
 * PUT /api/services/[id]
 * Updates service details.
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const { response } = await requireAuth();
    if (response) return response;

    const body = await request.json();
    const service = await db.services.update(params.id, body);
    if (!service) {
        return NextResponse.json({ error: 'Failed to update service' }, { status: 500 });
    }
    return NextResponse.json(service);
}

/**
 * DELETE /api/services/[id]
 * Cascade deletes service and related line items. Requires admin access.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const { response } = await requireAdmin();
    if (response) return response;

    const url = new URL(request.url);
    const confirmDelete = url.searchParams.get('confirm') === 'true';

    if (!confirmDelete) {
        const impact = await db.services.getCascadeImpact(params.id);
        return NextResponse.json({
            requiresConfirmation: true,
            impact,
            message: `This will delete ${impact.lineItems} line item(s) linked to this service.`
        });
    }

    const result = await db.services.delete(params.id);
    if (!result.success) {
        return NextResponse.json({ error: 'Failed to delete service' }, { status: 500 });
    }
    return NextResponse.json({
        success: true,
        message: 'Service and related line items deleted',
        deletedLineItems: result.deletedLineItems
    });
}
