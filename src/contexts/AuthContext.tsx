'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { Profile, AuthContextType } from '@/types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileCacheTime, setProfileCacheTime] = useState<number>(0);

  const supabase = createClient();

  const fetchProfile = useCallback(async (userId: string) => {
    // Check cache
    if (profile && profile.id === userId && Date.now() - profileCacheTime < PROFILE_CACHE_TTL) {
      return profile;
    }

    const { data, error } = await supabase
      .from('sub_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }

    const profileData: Profile = {
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      role: data.role,
      avatar_url: data.avatar_url,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    setProfile(profileData);
    setProfileCacheTime(Date.now());
    return profileData;
  }, [supabase, profile, profileCacheTime]);

  const createProfileForSSOUser = useCallback(async (authUser: User) => {
    // Get email - handle users without email
    const email = authUser.email || authUser.user_metadata?.preferred_username;
    const fullName = authUser.user_metadata?.full_name ||
                     authUser.user_metadata?.name ||
                     email?.split('@')[0];

    const { data, error } = await supabase
      .from('sub_profiles')
      .insert({
        id: authUser.id,
        email,
        full_name: fullName,
        role: 'user'
      })
      .select()
      .single();

    if (data && !error) {
      const profileData: Profile = {
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        role: data.role,
        avatar_url: data.avatar_url,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
      setProfile(profileData);
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      setProfileCacheTime(0); // Invalidate cache
      await fetchProfile(user.id);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await fetchProfile(session.user.id);
      }

      setIsLoading(false);
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Defer async operations to avoid Supabase client deadlock
          setTimeout(() => fetchProfile(session.user.id), 0);

          // Auto-create profile for new SSO users
          if (event === 'SIGNED_IN' && session.user.app_metadata?.provider === 'azure') {
            const { data: existingProfile } = await supabase
              .from('sub_profiles')
              .select('id')
              .eq('id', session.user.id)
              .single();

            if (!existingProfile) {
              await createProfileForSSOUser(session.user);
            }
          }
        } else {
          setProfile(null);
        }

        if (event === 'SIGNED_OUT') {
          setProfile(null);
        }
      }
    );

    // Safety timeout if auth event doesn't fire
    const timeout = setTimeout(() => setIsLoading(false), 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [supabase, fetchProfile, createProfileForSSOUser]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    return { error };
  };

  const signInWithAzure = async () => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${appUrl}/auth/callback`,
        scopes: 'email profile openid',
      },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
    setSession(null);
  };

  const resetPassword = async (email: string) => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/reset-password`,
    });
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  };

  const isSuperAdmin = profile?.role === 'super_admin';
  const isAdmin = profile?.role === 'admin' || isSuperAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        isLoading,
        isAuthenticated: !!user,
        isAdmin,
        isSuperAdmin,
        signIn,
        signUp,
        signInWithAzure,
        signOut,
        resetPassword,
        updatePassword,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
