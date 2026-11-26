import {
  CheckCircle2,
  Cloud,
  LogIn,
  LogOut,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  UserPlus,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { User } from '../firebase';

interface AuthModalProps {
  open: boolean;
  authUser: User | null;
  isAdmin: boolean;
  accountUsername: string;
  totalRolls: number;
  uniqueOwnedCount: number;
  accountLoaded: boolean;
  authError: string | null;
  onClose: () => void;
  onGoogleSignIn: () => Promise<void>;
  onEmailLogin: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (
    username: string,
    email: string,
    password: string,
  ) => Promise<void>;
  onResendVerification: () => Promise<void>;
  onRefreshVerification: () => Promise<void>;
  onUpdateUsername: (username: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}

export function AuthModal({
  open,
  authUser,
  isAdmin,
  accountUsername,
  totalRolls,
  uniqueOwnedCount,
  accountLoaded,
  authError,
  onClose,
  onGoogleSignIn,
  onEmailLogin,
  onEmailSignUp,
  onResendVerification,
  onRefreshVerification,
  onUpdateUsername,
  onSignOut,
}: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(accountUsername);

  useEffect(() => {
    setEditingName(accountUsername);
  }, [accountUsername]);

  useEffect(() => {
    if (open) {
      setLocalError(null);
    }
  }, [open, tab, authUser?.uid]);

  if (!open) return null;

  const displayError = localError || authError;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setLocalError('Please enter your email and password.');
      return;
    }

    if (tab === 'signup') {
      const cleanName = username.trim();
      if (!cleanName) {
        setLocalError('Please choose a display username.');
        return;
      }
      if (password.length < 6) {
        setLocalError('Password must be at least 6 characters.');
        return;
      }
    }

    setBusy(true);
    try {
      if (tab === 'login') {
        await onEmailLogin(trimmedEmail, password);
      } else {
        await onEmailSignUp(username.trim(), trimmedEmail, password);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleClick = async () => {
    setLocalError(null);
    setBusy(true);
    try {
      await onGoogleSignIn();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = editingName.trim().slice(0, 24);
    if (!clean) {
      setLocalError('Username cannot be empty.');
      return;
    }
    setLocalError(null);
    setBusy(true);
    try {
      await onUpdateUsername(clean);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#10141e] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <UserIcon className="w-4 h-4 text-amber-400" />
            <h2 className="font-display text-base font-semibold text-white">
              {authUser ? 'Player Account' : 'Account Log In / Sign Up'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {authUser && !authUser.emailVerified ? (
            /* Unverified Email Verification Prompt */
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                  <MailCheck className="w-4 h-4 shrink-0" />
                  <span>Verify Your Email to Unlock Cloud Save</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  We sent a verification link to{' '}
                  <strong className="text-white">{authUser.email}</strong>. Click
                  that link (check spam if needed), then click{' '}
                  <strong className="text-white">I Verified — Check Status</strong>{' '}
                  below to sync your saved auras &amp; join the shared server.
                </p>
              </div>

              {displayError && (
                <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 break-words">
                  {displayError}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onRefreshVerification();
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>I Verified — Check Status</span>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onResendVerification();
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-60 text-slate-200 text-xs font-medium border border-white/[0.08] transition-colors cursor-pointer"
                >
                  <MailCheck className="w-3.5 h-3.5 text-sky-400" />
                  <span>Resend Verification Email</span>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onSignOut();
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] text-xs font-medium transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          ) : authUser ? (
            /* Signed-in & Verified Profile View */
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-[#141925] border border-white/[0.08] space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {accountUsername}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {authUser.email}
                    </div>
                  </div>

                  {isAdmin ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[11px] font-semibold text-amber-300 shrink-0">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Dompinator · Studio Access</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-[11px] font-medium text-sky-300 shrink-0">
                      <Sparkles className="w-3 h-3" />
                      <span>Player</span>
                    </span>
                  )}
                </div>

                <div className="pt-2 border-t border-white/[0.07] flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-emerald-300">
                    {accountLoaded ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Cloud Save Synced</span>
                      </>
                    ) : (
                      <>
                        <Cloud className="w-3.5 h-3.5 animate-pulse" />
                        <span>Loading Account Save...</span>
                      </>
                    )}
                  </span>
                  <span className="font-mono-num text-slate-400">
                    {totalRolls.toLocaleString()} rolls · {uniqueOwnedCount} auras
                  </span>
                </div>
              </div>

              <form onSubmit={handleSaveName} className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Display Username (shown in Multiplayer)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editingName}
                    maxLength={24}
                    onChange={(e) => setEditingName(e.target.value)}
                    placeholder="Player"
                    className="flex-1 bg-[#0b0e16] border border-white/[0.1] focus:border-amber-500/70 rounded-lg px-3 py-2 text-xs text-white outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </form>

              {displayError && (
                <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 break-words">
                  {displayError}
                </div>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onSignOut();
                    onClose();
                  } finally {
                    setBusy(false);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-slate-200 text-xs font-medium transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            /* Signed-out Log In / Sign Up View */
            <div className="space-y-4">
              <p className="text-xs text-slate-400 leading-relaxed">
                Save your rolled auras, equipped aura, and total rolls to your
                account across devices and join the shared multiplayer server.
              </p>

              <div className="grid grid-cols-2 gap-1 bg-black/40 p-1 rounded-lg border border-white/[0.07]">
                <button
                  type="button"
                  onClick={() => setTab('login')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    tab === 'login'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Log In</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTab('signup')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    tab === 'signup'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Sign Up</span>
                </button>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-3">
                {tab === 'signup' && (
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      value={username}
                      maxLength={24}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Your display name"
                      className="w-full bg-[#0b0e16] border border-white/[0.1] focus:border-amber-500/70 rounded-lg px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full bg-[#0b0e16] border border-white/[0.1] focus:border-amber-500/70 rounded-lg px-3 py-2 text-xs text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      tab === 'signup' ? 'At least 6 characters' : 'Your password'
                    }
                    autoComplete={
                      tab === 'signup' ? 'new-password' : 'current-password'
                    }
                    className="w-full bg-[#0b0e16] border border-white/[0.1] focus:border-amber-500/70 rounded-lg px-3 py-2 text-xs text-white outline-none"
                  />
                </div>

                {displayError && (
                  <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 break-words">
                    {displayError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-semibold transition-colors cursor-pointer"
                >
                  {tab === 'login' ? (
                    <>
                      <LogIn className="w-3.5 h-3.5" />
                      <span>{busy ? 'Logging in...' : 'Log In'}</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{busy ? 'Creating Account...' : 'Create Account'}</span>
                    </>
                  )}
                </button>
              </form>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-white/[0.08]" />
                <span className="px-2.5 text-[11px] text-slate-500">or</span>
                <div className="flex-grow border-t border-white/[0.08]" />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={handleGoogleClick}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Continue with Google</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
