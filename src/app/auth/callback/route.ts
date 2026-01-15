import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /auth/callback
 * Handles OAuth callback and exchanges authorization code for session.
 *
 * IMPORTANT: In Azure Container Apps (and other reverse proxy setups),
 * request.url may contain internal URLs. We must check x-forwarded-host
 * and x-forwarded-proto headers to get the actual public origin.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const redirectTo = requestUrl.searchParams.get('redirectTo') || '/';

  // Get the correct origin from forwarded headers (for reverse proxy/load balancer)
  // Azure Container Apps sets these headers for incoming requests
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const origin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : requestUrl.origin;

  console.log(`[AUTH CALLBACK] Request URL: ${request.url}`);
  console.log(`[AUTH CALLBACK] Forwarded: host=${forwardedHost}, proto=${forwardedProto}`);
  console.log(`[AUTH CALLBACK] Resolved origin: ${origin}`);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[AUTH CALLBACK] Exchange failed:', error.message);
      return NextResponse.redirect(new URL('/login?error=callback_failed', origin));
    }

    console.log('[AUTH CALLBACK] Session exchange successful');
  }

  return NextResponse.redirect(new URL(redirectTo, origin));
}
