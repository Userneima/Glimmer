import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  getSupabaseUnavailableReason,
  isSupabaseAvailable,
  isSupabaseConfigured,
  resetSupabaseAvailability,
  subscribeSupabaseAvailability,
  supabase,
} from '../utils/supabase';
import { AuthContext, type AuthContextValue } from './authContextBase';
import { storage, setCurrentUserId } from '../utils/storage';
import { cloud } from '../utils/cloud';
import { allowSelfSignUp, isInternalEmailAllowed } from '../utils/auth';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cloudAvailable, setCloudAvailable] = useState(() => isSupabaseAvailable());

  useEffect(() => {
    const syncAvailability = () => {
      const available = isSupabaseAvailable();
      setCloudAvailable(available);

      if (!available) {
        setError(getSupabaseUnavailableReason() ?? 'Supabase is temporarily unreachable.');
        setLoading(false);
      }
    };

    syncAvailability();
    return subscribeSupabaseAvailability(syncAvailability);
  }, []);

  useEffect(() => {
    let active = true;

    const init = async () => {
      if (!isSupabaseConfigured || !supabase || !cloudAvailable) {
        if (active) setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        if (error) {
          setError(error.message);
        }
        if (data.session?.user?.id) {
          storage.copyAnonymousDataToUserIfEmpty(data.session.user.id);
          setCurrentUserId(data.session.user.id);
        } else {
          setCurrentUserId(null);
        }
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Supabase is temporarily unreachable.');
      }
      setLoading(false);
    };

    void init();

    if (!isSupabaseConfigured || !supabase || !cloudAvailable) {
      return () => {
        active = false;
      };
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      if (nextSession?.user?.id) {
        storage.copyAnonymousDataToUserIfEmpty(nextSession.user.id);
        setCurrentUserId(nextSession.user.id);
      } else {
        setCurrentUserId(null);
      }
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [cloudAvailable]);

  useEffect(() => {
    if (user?.id) {
      storage.copyAnonymousDataToUserIfEmpty(user.id);
    }
    setCurrentUserId(user?.id ?? null);
  }, [user?.id]);

  useEffect(() => {
    let active = true;

    const syncAiSettings = async () => {
      if (!user?.id || !cloudAvailable) return;
      try {
        const remoteSettings = await cloud.fetchAiSettings(user.id);
        if (!active || !remoteSettings) return;
        storage.saveAiSettings(remoteSettings);
      } catch (err) {
        console.warn('Failed to fetch user AI settings', err);
      }
    };

    void syncAiSettings();

    return () => {
      active = false;
    };
  }, [user?.id, cloudAvailable]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    resetSupabaseAvailability();
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
    resetSupabaseAvailability();
    if (!allowSelfSignUp) {
      const signupError = new Error('Self-service sign-up is disabled.');
      setError(signupError.message);
      throw signupError;
    }
    if (!isInternalEmailAllowed(email)) {
      const signupError = new Error('This email is not allowed for internal access.');
      setError(signupError.message);
      throw signupError;
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
    resetSupabaseAvailability();
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
    isConfigured: isSupabaseConfigured && cloudAvailable,
    allowSelfSignUp,
    signIn,
    signUp,
    signOut,
  }), [user, session, loading, error, signIn, signUp, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
