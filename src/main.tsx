import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext'
import { SyncStatusProvider } from './context/SyncStatusContext'
import { AppErrorBoundary } from './components/UI/AppErrorBoundary.tsx'

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
