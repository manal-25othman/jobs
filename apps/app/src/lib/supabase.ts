'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Auth, end-user path only.
 *
 * No social login, no admin console, no organisation membership — none of it
 * is needed to secure this slice, and each would be a surface to get wrong.
 *
 * The anon key is public by design. It is safe only because RLS denies by
 * default on all 48 tables; if RLS were ever disabled on one, this key becomes
 * a data leak.
 */
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required. See .env.example.',
    );
  }
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

/**
 * The current access token, refreshed when it is about to expire.
 *
 * supabase-js refreshes in the background (autoRefreshToken), but a tab that
 * was asleep can wake with an expired token. Forcing a refresh when fewer
 * than 60 s remain means the API never sees a stale signature from us.
 */
export async function accessToken(): Promise<string | null> {
  const client = supabase();
  const { data } = await client.auth.getSession();
  const session = data.session;
  if (!session) return null;
  const expiresIn = (session.expires_at ?? 0) * 1000 - Date.now();
  if (expiresIn < 60_000) {
    const { data: refreshed, error } = await client.auth.refreshSession();
    if (error || !refreshed.session) return null;
    return refreshed.session.access_token;
  }
  return session.access_token;
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut();
}
