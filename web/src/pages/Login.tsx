import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pw,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else nav('/dashboard');
  };

  const google = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  return (
    <div className="h-full flex items-center justify-center">
      <div className="card w-full max-w-sm p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">TickerNest</h1>
          <p className="text-2xs text-ink-muted">Personal investing OS.</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input
            className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full bg-bg border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
            placeholder="password"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full px-3 py-2 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
          {err && <p className="text-2xs text-loss">{err}</p>}
        </form>
        <div className="border-t border-line/60 pt-4">
          <button
            onClick={google}
            className="w-full px-3 py-2 rounded-md border border-line hover:bg-line/40 text-sm"
          >
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}
