import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { hydrateDesktopStore } from './utils/desktopStore.ts'

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
})
