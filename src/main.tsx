import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { flushDesktopStore, hydrateDesktopStore, isTauriRuntime } from './utils/desktopStore.ts'
import { startViewportHeightSync } from './utils/viewportHeight.ts'

startViewportHeightSync()

const renderApp = async () => {
  const [
    { default: App },
    { AuthProvider },
    { SyncStatusProvider },
    { AppErrorBoundary },
  ] = await Promise.all([
    import('./App.tsx'),
    import('./context/AuthContext'),
    import('./context/SyncStatusContext'),
    import('./components/UI/AppErrorBoundary.tsx'),
  ]);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppErrorBoundary>
        <AuthProvider>
          <SyncStatusProvider>
            <App />
          </SyncStatusProvider>
        </AuthProvider>
      </AppErrorBoundary>
    </StrictMode>,
  )
}

void hydrateDesktopStore().finally(() => {
  void renderApp();
  void listenForExit();
})

// 桌面版退出前，后端会先发这个事件：把还没写进数据文件的改动写完，再让它真正退出。
const listenForExit = async () => {
  if (!isTauriRuntime()) return;
  const [{ listen }, { invoke }] = await Promise.all([
    import('@tauri-apps/api/event'),
    import('@tauri-apps/api/core'),
  ]);
  await listen('glimmer://flush-before-exit', async () => {
    try {
      await flushDesktopStore();
    } finally {
      await invoke('finish_exit');
    }
  });
}
