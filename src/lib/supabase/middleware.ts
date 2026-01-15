import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // IMPORTANT: Use getUser() not getSession() for security
    // getSession() reads from cookies which can be tampered with
    // getUser() validates the JWT with Supabase Auth server
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) {
      console.log('[Middleware] Auth error:', error.message);
      return { supabaseResponse, user: null };
    }

    return { supabaseResponse, user };
  } catch (error) {
    console.error('[Middleware] Error:', error);
    return { supabaseResponse, user: null };
  }
}
