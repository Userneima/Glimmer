import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { storage, setCurrentUserId, rememberLastUserId, getLastUserId, inferLastUserIdFromStoredData } from '../utils/storage';
import { allowSelfSignUp, isInternalEmailAllowed } from '../utils/auth';
import { setSyncQueueUserId } from '../utils/syncQueue';
import { forgetDesktopAuthTokens, rememberDesktopAuthTokens } from '../utils/desktopStore';
import { loadLogin, saveLogin } from '../utils/savedLogin';

// 自动重新登录失败后，隔这么久才再试，免得密码改了之后反复撞服务器。
const AUTO_RELOGIN_COOLDOWN_MS = 10 * 60 * 1000;

// 本机存储读写哪个账号的数据，只由这里决定，别的地方不要再设。
// 规则：有登录会话用会话里的账号；会话过期或连不上云端时，用上次登录的账号；
// 两者都没有才用「未登录」那块。会话过期不代表这台电脑上的日记不是他的，
// 退回「未登录」那块会让日记看起来全没了，新写的也存错地方。
// 在渲染时就设好（而不是在 effect 里）：子组件的 effect 比这里的 effect 先跑，
// 晚一步设，它们第一次读到的就是错的那块。
let appliedStorageUserId: string | null | undefined;
const applyStorageUserId = (userId: string | null) => {
  if (appliedStorageUserId === userId) return;
  appliedStorageUserId = userId;
  if (userId) storage.adoptAnonymousDiaries(userId);
  setCurrentUserId(userId);
  setSyncQueueUserId(userId);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cloudAvailable, setCloudAvailable] = useState(() => isSupabaseAvailable());
  const [localUserId, setLocalUserId] = useState<string | null>(() => {
    const remembered = getLastUserId();
    if (remembered) return remembered;
    // 没有登录记忆但本机已经有账号数据：会话过期后一直没能重新登录的情况。
    // 认出来并记下，否则这些日记会一直看不见。
    const inferred = inferLastUserIdFromStoredData();
    if (inferred) rememberLastUserId(inferred);
    return inferred;
  });
  const [signInRequested, setSignInRequested] = useState(false);
  const storageUserId = user?.id ?? localUserId;
  applyStorageUserId(storageUserId);
  const [autoSigningIn, setAutoSigningIn] = useState(false);
  const lastAutoReloginAtRef = useRef(0);
  const explicitSignOutRef = useRef(false);

  // 登录状态过期时，用钥匙串里记住的账号密码悄悄重新登录。成功后
  // onAuthStateChange 会像手动登录一样把用户设上；失败就维持现状，
  // 由「登录已过期」提示条和登录页接手。
  const tryAutoRelogin = useCallback(async () => {
    if (!supabase || explicitSignOutRef.current) return;
    if (!getLastUserId()) return;
    if (Date.now() - lastAutoReloginAtRef.current < AUTO_RELOGIN_COOLDOWN_MS) return;
    lastAutoReloginAtRef.current = Date.now();

    // 先把提示条压住再去读钥匙串，不然读的那一下「登录已过期」会闪一下。
    setAutoSigningIn(true);
    try {
      const login = await loadLogin();
      // 只有他勾了「自动登录」、而且存了密码，才替他登。
      if (!login || !login.autoLogin || !login.password) return;
      const { error } = await supabase.auth.signInWithPassword({ email: login.email, password: login.password });
      if (error) {
        console.warn('Auto re-login failed', error.message);
        return;
      }
      await rememberDesktopAuthTokens();
    } catch (err) {
      console.warn('Auto re-login failed', err);
    } finally {
      setAutoSigningIn(false);
    }
  }, []);

  const requestSignIn = useCallback(() => setSignInRequested(true), []);
  const cancelSignIn = useCallback(() => setSignInRequested(false), []);

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
          void rememberDesktopAuthTokens().catch((err) => {
            console.warn('Failed to remember desktop auth session', err);
          });
          storage.copyAnonymousDataToUserIfEmpty(data.session.user.id);
        } else {
          void tryAutoRelogin();
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

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (nextSession?.user?.id) {
        void rememberDesktopAuthTokens().catch((err) => {
          console.warn('Failed to remember desktop auth session', err);
        });
        storage.copyAnonymousDataToUserIfEmpty(nextSession.user.id);
      } else {
        if (event === 'SIGNED_OUT') {
          void forgetDesktopAuthTokens().catch((err) => {
            console.warn('Failed to clear desktop auth session', err);
          });
          // 不是他自己点的退出（比如登录状态在后台续不上了），就试着自动登回来。
          void tryAutoRelogin();
        }
      }
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [cloudAvailable, tryAutoRelogin]);

  useEffect(() => {
    if (user?.id) {
      storage.copyAnonymousDataToUserIfEmpty(user.id);
      rememberLastUserId(user.id);
      setLocalUserId(user.id);
    }
  }, [user?.id, localUserId]);

  const signIn = useCallback(async (
    email: string,
    password: string,
    remember: { password: boolean; autoLogin: boolean } = { password: true, autoLogin: true },
  ) => {
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
    explicitSignOutRef.current = false;
    await rememberDesktopAuthTokens();
    // 邮箱总是记下，下次登录页直接填好；密码和自动登录按登录页的两个勾选框。
    await saveLogin({
      email,
      password: remember.password ? password : null,
      autoLogin: remember.password && remember.autoLogin,
    });
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
    await rememberDesktopAuthTokens();
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    resetSupabaseAvailability();
    setError(null);
    // 先标记再退出：退出会触发 SIGNED_OUT，那里不能把人自动登回去。
    // 记住的账号密码留着，下次登录页还是填好的；要不存，在登录页取消「记住密码」再登录一次。
    explicitSignOutRef.current = true;
    const { error } = await supabase.auth.signOut();
    if (error) {
      setError(error.message);
      throw error;
    }
    // 主动退出才清掉本地账号记忆；网络失败不清，否则日记会再次消失。
    rememberLastUserId(null);
    setLocalUserId(null);
    await forgetDesktopAuthTokens();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    loading,
    error,
    // 配置齐全就算 configured。此刻连不连得上是 cloudAvailable 的事，
    // 两者混在一起会导致云一断、登录入口跟着消失。
    isConfigured: isSupabaseConfigured,
    cloudAvailable,
    localUserId,
    storageUserId,
    signInRequested,
    autoSigningIn,
    requestSignIn,
    cancelSignIn,
    allowSelfSignUp,
    signIn,
    signUp,
    signOut,
  }), [user, session, loading, error, cloudAvailable, localUserId, storageUserId, signInRequested, autoSigningIn,
       requestSignIn, cancelSignIn, signIn, signUp, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
