import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../utils/supabase';
import { AuthContext, type AuthContextValue } from './authContextBase';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const init = async () => {
      if (!isSupabaseConfigured || !supabase) {
        if (active) setLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error) {
        setError(error.message);
      }
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setLoading(false);
    };

    void init();

    if (!isSupabaseConfigured || !supabase) {
      return () => {
        active = false;
      };
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      throw error;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    setError(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      setError(error.message);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setError(error.message);
      throw error;
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    loading,
    error,
    isConfigured: isSupabaseConfigured,
    signIn,
    signUp,
    signOut,
  }), [user, session, loading, error, signIn, signUp, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
