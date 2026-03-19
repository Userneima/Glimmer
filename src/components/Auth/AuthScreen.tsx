import React, { useState } from 'react';
import { t } from '../../i18n';
import { useAuth } from '../../context/useAuth';
import { isSupabaseConfigured } from '../../utils/supabase';
import { showToast } from '../../utils/toast';
import { BookOpen, AlertCircle, AlertTriangle } from 'lucide-react';

const extractErrorMessage = (err: unknown): string => {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'object' && err !== null) {
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage;
    }
    const nestedError = (err as { error?: { message?: unknown } }).error;
    if (nestedError && typeof nestedError.message === 'string' && nestedError.message.trim()) {
      return nestedError.message;
    }
  }
  if (typeof err === 'string') {
    return err;
  }
  return '';
};

export const AuthScreen: React.FC = () => {
  const { signIn, signUp, loading, error } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      showToast(t('Please enter email and password'));
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
        showToast(t('Account created. Please check your email to confirm.'));
      }
    } catch (err) {
      console.error('Auth submit failed:', err);
      const message = extractErrorMessage(err);
      showToast(message || t('Sign in failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMode = () => {
    setMode((prev) => (prev === 'signin' ? 'signup' : 'signin'));
  };

  const disabled = submitting || loading || !isSupabaseConfigured;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary-50 to-white px-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-br from-accent-500/10 via-accent-400/5 to-transparent rounded-full blur-3xl" />
      </div>
      
      <div className="relative w-full max-w-[420px] animate-slide-up">
        {/* Logo and branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-apple-xl bg-gradient-to-br from-accent-500 to-accent-600 shadow-apple-lg mb-4">
            <BookOpen className="w-8 h-8 text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-bold text-primary-900 tracking-tight mb-2">
            {t('Cloud Sync Login')}
          </h1>
          <p className="text-base text-primary-500">
            {t('Sign in to access your cloud diaries across devices.')}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/80 backdrop-blur-apple border border-white/60 rounded-apple-2xl shadow-apple-xl p-8">
          {!isSupabaseConfigured && (
            <div className="mb-6 flex items-start gap-3 rounded-apple-lg border border-semantic-warning/30 bg-semantic-warning/10 p-4">
              <AlertTriangle className="w-5 h-5 text-semantic-warning flex-shrink-0 mt-0.5" />
              <p className="text-sm text-primary-700 leading-relaxed">
                {t('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')}
              </p>
            </div>
          )}

          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-apple-lg border border-semantic-error/30 bg-semantic-error/10 p-4">
              <AlertCircle className="w-5 h-5 text-semantic-error flex-shrink-0 mt-0.5" />
              <p className="text-sm text-semantic-error leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-primary-700 mb-2">
                {t('Email')}
              </label>
              <input
                className="
                  w-full px-4 py-3 
                  bg-primary-50/80 
                  border border-primary-200
                  rounded-apple 
                  text-primary-900
                  placeholder:text-primary-400
                  transition-all duration-200 ease-apple
                  focus:bg-white focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none
                  hover:border-primary-300
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
                type="email"
                autoComplete="email"
                placeholder={t('Enter your email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={disabled}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-primary-700 mb-2">
                {t('Password')}
              </label>
              <input
                className="
                  w-full px-4 py-3 
                  bg-primary-50/80 
                  border border-primary-200
                  rounded-apple 
                  text-primary-900
                  placeholder:text-primary-400
                  transition-all duration-200 ease-apple
                  focus:bg-white focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none
                  hover:border-primary-300
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder={t('Enter your password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={disabled}
              />
            </div>

            <button
              type="submit"
              className="
                w-full py-3.5 
                rounded-apple 
                bg-gradient-to-b from-accent-500 to-accent-600
                text-white font-semibold
                shadow-apple
                transition-all duration-200 ease-apple
                hover:from-accent-400 hover:to-accent-500 hover:shadow-apple-lg
                active:scale-[0.98] active:from-accent-600 active:to-accent-700
                disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
              "
              disabled={disabled}
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('Signing in...')}
                </span>
              ) : (
                mode === 'signin' ? t('Sign in') : t('Create account')
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-primary-100">
            <button
              type="button"
              onClick={toggleMode}
              className="
                w-full py-2.5
                text-sm font-medium text-accent-500
                rounded-apple
                transition-all duration-200 ease-apple
                hover:bg-accent-50 hover:text-accent-600
                active:scale-[0.98]
                disabled:opacity-50 disabled:cursor-not-allowed
              "
              disabled={disabled}
            >
              {mode === 'signin' ? t('No account? Sign up') : t('Have an account? Sign in')}
            </button>
          </div>
        </div>
        
        {/* Footer */}
        <p className="text-center text-xs text-primary-400 mt-6">
          {t('Your data is securely synced across all your devices')}
        </p>
      </div>
    </div>
  );
};
