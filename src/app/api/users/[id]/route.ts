import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requireSuperAdmin } from '@/lib/api-auth';
import type { UserRole } from '@/types/auth';

/**
 * PATCH /api/users/[id]
 * Updates user role. Requires admin access.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const { role } = body as { role: UserRole };
  const userId = params.id;

  // Validate role
  const validRoles: UserRole[] = ['user', 'admin', 'super_admin'];
  if (!role || !validRoles.includes(role)) {
    return NextResponse.json(
      { error: 'Invalid role. Must be: user, admin, or super_admin' },
      { status: 400 }
    );
  }

  // Super admin role changes require super_admin permission
  if (role === 'super_admin') {
    const { response, supabase, profile } = await requireSuperAdmin();
    if (response) return response;

    // Prevent demoting yourself from super_admin
    if (profile!.id === userId) {
      return NextResponse.json(
        { error: 'Cannot change your own role' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase!
      .from('sub_profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update user role' }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  // Admin or super_admin can change users to user/admin roles
  const { response, supabase, profile } = await requireAdmin();
  if (response) return response;

  // Check if target user is super_admin (only super_admin can demote super_admin)
  const { data: targetUser } = await supabase!
    .from('sub_profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (targetUser?.role === 'super_admin' && profile!.role !== 'super_admin') {
    return NextResponse.json(
      { error: 'Only super admins can modify super admin users' },
      { status: 403 }
    );
  }

  // Prevent changing your own role
  if (profile!.id === userId) {
    return NextResponse.json(
      { error: 'Cannot change your own role' },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase!
      .from('sub_profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update user role' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to update user role' }, { status: 500 });
  }
}

/**
 * GET /api/users/[id]
 * Returns single user details. Requires admin access.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { response, supabase } = await requireAdmin();
  if (response) return response;

  try {
    const { data: profile, error } = await supabase!
      .from('sub_profiles')
      .select('id, email, full_name, role, avatar_url, created_at, updated_at')
      .eq('id', params.id)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}
