import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/api-auth';

/**
 * GET /api/vendors/merge?sourceVendorId=...
 * Returns preview of what will be moved during merge.
 */
export async function GET(request: NextRequest) {
    const { response } = await requireAdmin();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const sourceVendorId = searchParams.get('sourceVendorId');

    if (!sourceVendorId) {
        return NextResponse.json(
            { error: 'sourceVendorId is required' },
            { status: 400 }
        );
    }

    const preview = await db.vendors.getMergePreview(sourceVendorId);
    return NextResponse.json(preview);
}

/**
 * POST /api/vendors/merge
 * Executes the vendor merge operation.
 * Body: { sourceVendorId, targetVendorId, newName? }
 */
export async function POST(request: NextRequest) {
    const { response } = await requireAdmin();
    if (response) return response;

    const body = await request.json();
    const { sourceVendorId, targetVendorId, newName } = body;

    if (!sourceVendorId || !targetVendorId) {
        return NextResponse.json(
            { error: 'sourceVendorId and targetVendorId are required' },
            { status: 400 }
        );
    }

    if (sourceVendorId === targetVendorId) {
        return NextResponse.json(
            { error: 'Cannot merge vendor into itself' },
            { status: 400 }
        );
    }

    // Verify both vendors exist
    const sourceVendor = await db.vendors.findById(sourceVendorId);
    const targetVendor = await db.vendors.findById(targetVendorId);

    if (!sourceVendor) {
        return NextResponse.json(
            { error: 'Source vendor not found' },
            { status: 404 }
        );
    }

    if (!targetVendor) {
        return NextResponse.json(
            { error: 'Target vendor not found' },
            { status: 404 }
        );
    }

    const result = await db.vendors.merge(sourceVendorId, targetVendorId, newName);

    if (!result.success) {
        return NextResponse.json(
            { error: result.error || 'Merge operation failed' },
            { status: 500 }
        );
    }

    return NextResponse.json({
        success: true,
        message: `Successfully merged "${sourceVendor.name}" into "${newName || targetVendor.name}"`,
        merged: result.merged
    });
}
