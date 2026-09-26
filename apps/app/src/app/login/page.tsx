'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

/**
 * One end-user sign-in path, and nothing more.
 *
 * No social login, no password recovery flow, no admin console, no
 * organisation membership: none of it is needed to secure this slice, and each
 * would be a surface to get wrong before anyone has used the product.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const client = supabase();
      const { error: err } =
        mode === 'sign_in'
          ? await client.auth.signInWithPassword({ email, password })
          : await client.auth.signUp({ email, password });
      if (err) throw err;
      router.push('/goal');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap" style={{ maxWidth: 420 }}>
      <h1>نَقْلة</h1>
      <p className="body-sm muted">من المهارة إلى الدليل.</p>

      <form className="card" onSubmit={submit}>
        <h2>{mode === 'sign_in' ? 'تسجيل الدخول' : 'إنشاء حساب'}</h2>

        <label className="field">
          <span className="field__label">البريد الإلكتروني</span>
          <input
            className="input term" dir="ltr" type="email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <label className="field">
          <span className="field__label">كلمة المرور</span>
          <input
            className="input" type="password" required minLength={8}
            value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
          />
        </label>

        {error ? <span className="field__error" role="alert">{error}</span> : null}

        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? 'جارٍ…' : mode === 'sign_in' ? 'دخول' : 'إنشاء الحساب'}
        </button>

        <button
          className="link" type="button"
          style={{ background: 'none', border: 0, cursor: 'pointer' }}
          onClick={() => setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in')}
        >
          {mode === 'sign_in' ? 'ليس لديك حساب؟ أنشئي واحدًا' : 'لديك حساب؟ سجّلي الدخول'}
        </button>
      </form>
    </main>
  );
}
