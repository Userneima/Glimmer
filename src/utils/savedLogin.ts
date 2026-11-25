import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './desktopStore';

export type SavedLogin = {
  email: string;
  /** 没勾「记住密码」时不存 */
  password?: string | null;
  /** 勾了「自动登录」：登录状态过期时用存下的密码自己重新登录 */
  autoLogin: boolean;
};

// 云同步的邮箱和密码存在系统钥匙串里，只有桌面版有。
// 网页版交给浏览器自己的「记住密码」，这里一律什么都不做。
// 读写钥匙串失败不影响登录本身，只是下次还得手动输。

export const saveLogin = async (login: SavedLogin) => {
  if (!isTauriRuntime()) return;
  try {
    await invoke('save_login', { email: login.email, password: login.password ?? null, autoLogin: login.autoLogin });
  } catch (err) {
    console.warn('Failed to save login to keychain', err);
  }
};

export const loadLogin = async (): Promise<SavedLogin | null> => {
  if (!isTauriRuntime()) return null;
  try {
    return (await invoke<SavedLogin | null>('load_login')) ?? null;
  } catch (err) {
    console.warn('Failed to read login from keychain', err);
    return null;
  }
};
