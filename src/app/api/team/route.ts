import { NextResponse } from 'next/server';
import { createDb } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/team
 * Returns all employees/team members.
 */
export async function GET() {
    const { response, supabase } = await requireAuth();
    if (response) return response;
    const db = createDb(supabase!);

    try {
        const data = await db.employees.findAll();
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });
    }
}

/**
 * POST /api/team
 * Creates a new employee/team member.
 */
export async function POST(request: Request) {
    const { response, supabase } = await requireAuth();
    if (response) return response;
    const db = createDb(supabase!);

    try {
        const body = await request.json();
        const newEmployee = await db.employees.create(body);
        return NextResponse.json(newEmployee, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Failed to create employee' }, { status: 500 });
    }
}
