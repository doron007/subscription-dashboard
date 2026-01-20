import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/api-auth';

/**
 * GET /api/services/merge?sourceServiceId=...
 * Returns preview of what will be moved during merge.
 */
export async function GET(request: NextRequest) {
    const { response } = await requireAdmin();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const sourceServiceId = searchParams.get('sourceServiceId');

    if (!sourceServiceId) {
        return NextResponse.json(
            { error: 'sourceServiceId is required' },
            { status: 400 }
        );
    }

    const preview = await db.services.getMergePreview(sourceServiceId);
    return NextResponse.json(preview);
}

/**
 * POST /api/services/merge
 * Executes the service merge operation.
 * Body: { sourceServiceId, targetServiceId }
 */
export async function POST(request: NextRequest) {
    const { response } = await requireAdmin();
    if (response) return response;

    const body = await request.json();
    const { sourceServiceId, targetServiceId } = body;

    if (!sourceServiceId || !targetServiceId) {
        return NextResponse.json(
            { error: 'sourceServiceId and targetServiceId are required' },
            { status: 400 }
        );
    }

    if (sourceServiceId === targetServiceId) {
        return NextResponse.json(
            { error: 'Cannot merge service into itself' },
            { status: 400 }
        );
    }

    // Verify both services exist
    const sourceService = await db.services.findById(sourceServiceId);
    const targetService = await db.services.findById(targetServiceId);

    if (!sourceService) {
        return NextResponse.json(
            { error: 'Source service not found' },
            { status: 404 }
        );
    }

    if (!targetService) {
        return NextResponse.json(
            { error: 'Target service not found' },
            { status: 404 }
        );
    }

    const result = await db.services.merge(sourceServiceId, targetServiceId);

    if (!result.success) {
        return NextResponse.json(
            { error: result.error || 'Merge operation failed' },
            { status: 500 }
        );
    }

    return NextResponse.json({
        success: true,
        message: `Successfully merged "${sourceService.name}" into "${targetService.name}"`,
        movedLineItems: result.movedLineItems
    });
}
