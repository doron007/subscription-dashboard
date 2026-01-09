import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
    try {
        const vendors = await db.vendors.findAll();
        return NextResponse.json(vendors);
    } catch (error) {
        console.error('[VendorsAPI] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 });
    }
}
