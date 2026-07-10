import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthContext, type AdminProfile, type AuthContextValue } from '@/context/auth-context';
import { supabase } from '@/config/supabase';

const AUTHORIZED_ADMIN_EMAILS = [
  'admin@prosavis.com',
  'support@prosavis.com',
  'oliverafrancy@gmail.com',
] as const;

const UNAUTHORIZED_MESSAGE =
  'No tienes permisos para acceder al CRM WhatsApp.';

function normalizeEmail(email?: string | null): string {
  return (email ?? '').trim().toLowerCase();
}

function isAuthorizedEmail(email?: string | null): boolean {
  const normalized = normalizeEmail(email);
  return (AUTHORIZED_ADMIN_EMAILS as readonly string[]).includes(normalized);
}

async function loadProfile(userId: string): Promise<AdminProfile | null> {
  const { data, error } = await supabase
    .from('admin_profiles')
    .select('id,email,display_name,role,is_active')
    .eq('id', userId)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return {
    id: data.id,
    email: data.email,
    displayName: data.display_name ?? undefined,
    role: data.role,
    isActive: data.is_active,
  };
}

async function ensureAdminProfile(): Promise<AdminProfile | null> {
  const { data, error } = await supabase.rpc('ensure_crm_admin_profile');
  if (error) {
    console.error('ensure_crm_admin_profile failed:', error);
    return null;
  }
  if (!data) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? undefined,
    role: row.role,
    isActive: row.is_active,
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);

    if (!nextSession?.user) {
      setProfile(null);
      return;
    }

    const email = nextSession.user.email;
    if (!isAuthorizedEmail(email)) {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      throw new Error(UNAUTHORIZED_MESSAGE);
    }

    try {
      let nextProfile = await loadProfile(nextSession.user.id);
      if (!nextProfile) {
        nextProfile = await ensureAdminProfile();
      }
      setProfile(nextProfile);
    } catch (error) {
      console.error('No se pudo cargar el perfil de administrador:', error);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        try {
          await refreshProfile(data.session);
        } catch (error) {
          console.error(error);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void (async () => {
        try {
          await refreshProfile(nextSession);
        } catch (error) {
          console.error(error);
        } finally {
          if (mounted) setLoading(false);
        }
      })();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refreshProfile]);

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = `${window.location.origin}/login`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      profile,
      loading,
      isAdmin: !!profile && ['admin', 'super_admin'].includes(profile.role),
      signInWithGoogle,
      signOut,
    }),
    [loading, profile, session, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
