import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { Profile } from '@/types/auth';

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  return { user, error, supabase };
}

export async function requireAuth() {
  const { user, error, supabase } = await getAuthenticatedUser();

  if (error || !user) {
    return {
      user: null,
      supabase: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { user, supabase, response: null };
}

export async function requireAdmin() {
  const { user, supabase, response } = await requireAuth();

  if (response) {
    return { user: null, supabase: null, profile: null, response };
  }

  const { data: profile } = await supabase!
    .from('sub_profiles')
    .select('*')
    .eq('id', user!.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
    return {
      user: null,
      supabase: null,
      profile: null,
      response: NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 }),
    };
  }

  return { user, supabase, profile: profile as Profile, response: null };
}

export async function requireSuperAdmin() {
  const { user, supabase, response } = await requireAuth();

  if (response) {
    return { user: null, supabase: null, profile: null, response };
  }

  const { data: profile } = await supabase!
    .from('sub_profiles')
    .select('*')
    .eq('id', user!.id)
    .single();

  if (!profile || profile.role !== 'super_admin') {
    return {
      user: null,
      supabase: null,
      profile: null,
      response: NextResponse.json({ error: 'Forbidden: Super admin access required' }, { status: 403 }),
    };
  }

  return { user, supabase, profile: profile as Profile, response: null };
}

export async function getProfile(userId: string) {
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from('sub_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    return { profile: null, error };
  }

  return { profile: profile as Profile, error: null };
}
