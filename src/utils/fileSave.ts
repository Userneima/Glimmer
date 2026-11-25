import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './desktopStore';

const blobToBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

// 把一个文件交给用户。网页版走浏览器下载；桌面版窗口不处理网页下载（点了什么都不会发生），
// 所以直接写进「下载」文件夹并在访达里选中。返回桌面版保存的路径，网页版返回 null。
export const downloadFile = async (
  filename: string,
  blob: Blob,
  options?: { subfolder?: string; reveal?: boolean },
): Promise<string | null> => {
  if (isTauriRuntime()) {
    return invoke<string>('save_to_downloads', {
      fileName: filename,
      base64: await blobToBase64(blob),
      subfolder: options?.subfolder ?? null,
      reveal: options?.reveal ?? true,
    });
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return null;
};

export const openCalendarPrivacySettings = async () => {
  if (!isTauriRuntime()) return;
  await invoke('open_calendar_privacy_settings');
};
