import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET() {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const data = await db.employees.findAll();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const { response } = await requireAuth();
    if (response) return response;

    try {
        const body = await request.json();
        const newEmployee = await db.employees.create(body);
        return NextResponse.json(newEmployee, { status: 201 });
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Failed to create employee' }, { status: 500 });
    }
}
