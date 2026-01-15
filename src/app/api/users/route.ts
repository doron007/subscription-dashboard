import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';

/**
 * GET /api/users
 * Returns all users. Requires admin access.
 */
export async function GET() {
  const { response, supabase } = await requireAdmin();
  if (response) return response;

  try {
    const { data: profiles, error } = await supabase!
      .from('sub_profiles')
      .select('id, email, full_name, role, avatar_url, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    return NextResponse.json(profiles || []);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
