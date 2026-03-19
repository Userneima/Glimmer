import { AppLayout } from './components/Layout/AppLayout';
import { AuthScreen } from './components/Auth/AuthScreen';
import { useAuth } from './context/useAuth';
import { t } from './i18n';

function App() {
  const { user, loading, isConfigured } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary-50 to-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-apple-lg bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center shadow-apple animate-pulse">
            <svg className="w-6 h-6 text-white animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <p className="text-primary-500 font-medium">{t('Loading...')}</p>
        </div>
      </div>
    );
  }

  if (isConfigured && !user) {
    return <AuthScreen />;
  }

  return <AppLayout />;
}

export default App;
