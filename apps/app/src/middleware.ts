import { NextResponse, type NextRequest } from 'next/server';

/**
 * Staging gate (Phase C round 3): a PRIVATE trial must not be browsable by the public. When STAGING_BASIC_AUTH_USER and
 * STAGING_BASIC_AUTH_PASSWORD are set (Vercel environment variables, never in the repository), every page asks for
 * them first. This is the outer lock; the inner locks are invite-only sign-in (Supabase) and the API allow-list.
 * Unset (local development, tests): no gate.
 */
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'] };

async function digest(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function middleware(req: NextRequest) {
  const user = process.env.STAGING_BASIC_AUTH_USER;
  const pass = process.env.STAGING_BASIC_AUTH_PASSWORD;
  if (!user || !pass) return NextResponse.next();
  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    let given = '';
    try { given = atob(header.slice(6)); } catch { given = ''; }
    // Compare digests so the comparison does not leak the length or prefix of the secret.
    if ((await digest(given)) === (await digest(`${user}:${pass}`))) {
      const res = NextResponse.next();
      res.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return res;
    }
  }
  return new NextResponse('بيئة تجربة خاصة — الدخول للمدعوّين فقط.', {
    status: 401, headers: { 'WWW-Authenticate': 'Basic realm="NAQLA staging", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
