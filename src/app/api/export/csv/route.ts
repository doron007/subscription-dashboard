import { NextRequest } from 'next/server';

// Opt out of static generation
export const dynamic = 'force-dynamic';

// GET /api/export/csv?data=base64&filename=name.csv - Download CSV file
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const encodedData = searchParams.get('data');
        const filename = searchParams.get('filename') || 'export.csv';

        if (!encodedData) {
            return new Response(JSON.stringify({ error: 'Missing data parameter' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Decode base64 data
        const csv = Buffer.from(encodedData, 'base64').toString('utf-8');

        // Sanitize filename - be very strict
        const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');

        // RFC 5987 encoding for filename - better browser support
        const encodedFilename = encodeURIComponent(safeFilename).replace(/['()]/g, escape);

        // Use native Response instead of NextResponse to avoid Next.js header modifications
        return new Response(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        console.error('[ExportCSV] Error:', error);
        return new Response(JSON.stringify({ error: 'Failed to generate CSV' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
