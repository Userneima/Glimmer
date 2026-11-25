import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  /** 云端此刻是否连得上。与 isConfigured 分开：配置齐全但连不上时仍要能用本地数据。 */
  cloudAvailable: boolean;
  /** 上次登录成功的用户 ID。云端连不上、没有活动会话时，靠它读本机数据。 */
  localUserId: string | null;
  /** 本机存储此刻读写的是哪个账号的数据：有会话用会话账号，否则用上次登录的账号。 */
  storageUserId: string | null;
  /** 用户主动点了"登录"，需要弹出登录界面。 */
  signInRequested: boolean;
  /** 桌面版正在用钥匙串里记住的账号密码自动重新登录。这期间不提示「登录已过期」。 */
  autoSigningIn: boolean;
  requestSignIn: () => void;
  cancelSignIn: () => void;
  allowSelfSignUp: boolean;
  signIn: (email: string, password: string, remember?: { password: boolean; autoLogin: boolean }) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
