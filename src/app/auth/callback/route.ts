import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const redirectTo = requestUrl.searchParams.get('redirectTo') || '/';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Auth callback error:', error);
      return NextResponse.redirect(
        new URL('/login?error=callback_failed', requestUrl.origin)
      );
    }

    // Log successful auth for debugging
    if (data.user) {
      console.log('Auth callback success:', {
        user: data.user.email,
        provider: data.user.app_metadata?.provider,
      });
    }
  }

  return NextResponse.redirect(new URL(redirectTo, requestUrl.origin));
}
