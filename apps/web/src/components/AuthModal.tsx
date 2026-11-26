import { useState, type FormEvent } from 'react';
import {
  DIFFICULTY_CONFIGS,
  type DifficultyKey,
  type LoginInput,
  type RegisterInput,
} from '@starspell/shared';
import { ApiError } from '../api/client';

export interface AuthModalProps {
  open: boolean;
  initialTab?: 'login' | 'register';
  difficulty: DifficultyKey;
  onLogin: (input: LoginInput) => Promise<void>;
  onRegister: (input: RegisterInput) => Promise<void>;
  onClose: () => void;
}

export function AuthModal({
  open,
  initialTab = 'login',
  difficulty,
  onLogin,
  onRegister,
  onClose,
}: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'register'>(initialTab);
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const cfg = DIFFICULTY_CONFIGS[difficulty];

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (tab === 'login') {
        await onLogin({ identifier: identifier.trim(), password });
      } else {
        await onRegister({ email: email.trim(), username: username.trim(), password });
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to reach server. Please check your connection.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="auth-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Account Authentication"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
    >
      <div className="twilight-glass rounded-[2rem] w-full max-w-md p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-2xl text-amber-50">
            {tab === 'login' ? 'Sign In' : 'Create Account'}
          </h2>
          <button
            id="btn-close-auth"
            type="button"
            onClick={onClose}
            className="twilight-pill w-9 h-9 rounded-full flex items-center justify-center text-amber-100 hover:text-white cursor-pointer"
            aria-label="Close Account Dialog"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-full bg-slate-950/50 border border-amber-200/15">
          <button
            id="tab-auth-login"
            type="button"
            onClick={() => {
              setTab('login');
              setError(null);
            }}
            className={`rounded-full py-1.5 text-xs font-semibold transition cursor-pointer ${
              tab === 'login'
                ? 'bg-amber-300 text-slate-950'
                : 'text-amber-100/80 hover:text-amber-50'
            }`}
          >
            Sign In
          </button>
          <button
            id="tab-auth-register"
            type="button"
            onClick={() => {
              setTab('register');
              setError(null);
            }}
            className={`rounded-full py-1.5 text-xs font-semibold transition cursor-pointer ${
              tab === 'register'
                ? 'bg-amber-300 text-slate-950'
                : 'text-amber-100/80 hover:text-amber-50'
            }`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3.5">
          {tab === 'login' ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-amber-100/90">Email or Username</span>
              <input
                id="input-auth-identifier"
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com or stargazer"
                className="rounded-xl px-3.5 py-2.5 text-sm bg-slate-950/60 border border-amber-200/20 text-amber-50 focus:outline-none focus:border-amber-300/60"
              />
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-amber-100/90">Email</span>
                <input
                  id="input-auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="rounded-xl px-3.5 py-2.5 text-sm bg-slate-950/60 border border-amber-200/20 text-amber-50 focus:outline-none focus:border-amber-300/60"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-amber-100/90">Username</span>
                <input
                  id="input-auth-username"
                  type="text"
                  required
                  minLength={3}
                  maxLength={24}
                  pattern="[a-zA-Z0-9_-]{3,24}"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="canyon_speller"
                  className="rounded-xl px-3.5 py-2.5 text-sm bg-slate-950/60 border border-amber-200/20 text-amber-50 focus:outline-none focus:border-amber-300/60"
                />
              </label>
            </>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-amber-100/90">Password</span>
            <input
              id="input-auth-password"
              type="password"
              required
              minLength={tab === 'register' ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tab === 'register' ? 'At least 8 characters' : 'Your password'}
              className="rounded-xl px-3.5 py-2.5 text-sm bg-slate-950/60 border border-amber-200/20 text-amber-50 focus:outline-none focus:border-amber-300/60"
            />
          </label>

          {error && (
            <p
              id="auth-error-msg"
              className="rounded-xl px-3 py-2 text-xs text-rose-200 bg-rose-500/15 border border-rose-300/30"
            >
              {error}
            </p>
          )}

          <button
            id="btn-auth-submit"
            type="submit"
            disabled={submitting}
            className={`mt-1 w-full rounded-full py-3 font-semibold text-sm text-slate-950 bg-gradient-to-r transition cursor-pointer disabled:opacity-60 ${cfg.ctaClasses}`}
          >
            {submitting ? 'Please wait…' : tab === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="text-[11px] text-amber-100/60 text-center leading-relaxed">
          Password reset is not available (no email provider configured). Guest progress remains
          stored on this device until imported.
        </p>
      </div>
    </div>
  );
}
