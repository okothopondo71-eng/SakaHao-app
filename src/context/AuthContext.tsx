import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import type { Session } from '@supabase/supabase-js';

import {
  supabase,
  type Profile,
  type UserRole,
} from '@/lib/supabase';

import {
  hasPMSAccess,
  type PMSSubscription,
} from '@/lib/PMSAccess';
import { getMyPMSSubscription } from '@/components/PMS/pmsService';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  needsRoleSelection: boolean;
  subscription: PMSSubscription | null;
  hasActivePMS: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  setRole: (role: UserRole) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<PMSSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Profile fetch error:', error);
      setProfile(null);
      return;
    }

    setProfile(data as Profile | null);
  };

  // The live database exposes PMS subscriptions through the RPC contract.
  // Do not query the removed legacy public.subscriptions table.
  const fetchSubscription = async (_userId: string) => {
    try {
      const data = await getMyPMSSubscription();
      setSubscription(data);
    } catch (error) {
      console.error('PMS subscription fetch error:', error);
      setSubscription(null);
    }
  };

  const hasActivePMS = hasPMSAccess(subscription);

  const needsRoleSelection =
    !loading && !!session && !!profile && !profile.role;

  const loadUserData = async (userId: string) => {
    await Promise.all([fetchProfile(userId), fetchSubscription(userId)]);
  };

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(session);

      if (session?.user) {
        await loadUserData(session.user.id);
      } else {
        setProfile(null);
        setSubscription(null);
      }

      if (mounted) setLoading(false);
    };

    initializeAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;

      setSession(nextSession);

      if (!nextSession?.user) {
        setProfile(null);
        setSubscription(null);
        setLoading(false);
        return;
      }

      setTimeout(async () => {
        if (!mounted) return;
        await loadUserData(nextSession.user.id);
        if (mounted) setLoading(false);
      }, 0);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) return { error: error.message };

    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        full_name: fullName,
        role: null,
        verification_status: 'unverified',
      });

      if (profileError && !profileError.message.includes('duplicate')) {
        console.error('Profile creation error:', profileError);
        return { error: profileError.message };
      }
    }

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    if (data.user) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle();

      if (!existing) {
        const { error: profileError } = await supabase.from('profiles').insert({
          id: data.user.id,
          email: data.user.email || email,
          full_name: data.user.user_metadata?.full_name || '',
          role: null,
          verification_status: 'unverified',
        });

        if (profileError) console.error('Profile creation error:', profileError);
      }

      await loadUserData(data.user.id);
    }

    return { error: null };
  };

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    setSubscription(null);
  };

  const setRole = async (role: UserRole) => {
    if (!session?.user) return { error: 'Not authenticated' };

    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', session.user.id);

    if (error) return { error: error.message };

    await fetchProfile(session.user.id);
    return { error: null };
  };

  const refreshProfile = async () => {
    if (session?.user) await fetchProfile(session.user.id);
  };

  const refreshSubscription = async () => {
    if (!session?.user) {
      setSubscription(null);
      return;
    }
    await fetchSubscription(session.user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        needsRoleSelection,
        subscription,
        hasActivePMS,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
        setRole,
        refreshProfile,
        refreshSubscription,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
