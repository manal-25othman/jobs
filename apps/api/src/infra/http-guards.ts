import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Per-client rate limit (fixed one-minute window, in memory, per API instance). The client is the IP plus a hash of
 * the bearer token, so one user cannot exhaust another's allowance behind the same address. Health probes are exempt.
 * Off unless configured or deployed (NODE_ENV=production: default 120/min). A shared store is needed only when the
 * API runs on several instances (documented in the staging plan).
 */
export function rateLimit(env: NodeJS.ProcessEnv = process.env) {
  const configured = env['RATE_LIMIT_PER_MINUTE'] ? Number(env['RATE_LIMIT_PER_MINUTE']) : env['NODE_ENV'] === 'production' ? 120 : 0;
  const limit = Number.isInteger(configured) && configured > 0 ? configured : 0;
  const hits = new Map<string, { windowStart: number; n: number }>();
  let sweptAt = Date.now();
  return (req: Request, res: Response, next: NextFunction) => {
    if (!limit || /^\/(health|ready)\b/.test(req.path)) return next();
    const now = Date.now();
    if (now - sweptAt > 60_000) { for (const [k, v] of hits) if (now - v.windowStart > 60_000) hits.delete(k); sweptAt = now; }
    const auth = req.headers['authorization'];
    const who = typeof auth === 'string' ? createHash('sha256').update(auth).digest('hex').slice(0, 16) : 'anon';
    const key = `${req.ip ?? 'unknown'}|${who}`;
    const cur = hits.get(key);
    if (!cur || now - cur.windowStart >= 60_000) { hits.set(key, { windowStart: now, n: 1 }); return next(); }
    cur.n++;
    if (cur.n > limit) {
      res.setHeader('Retry-After', String(Math.ceil((60_000 - (now - cur.windowStart)) / 1000)));
      return res.status(429).json({ ok: false, error: { code: 'rate_limited', message: 'طلبات كثيرة في وقت قصير؛ أعيدي المحاولة بعد قليل.' } });
    }
    return next();
  };
}

/** Minimal security headers for a JSON API; staging is also kept out of search engines. */
export function securityHeaders(env: NodeJS.ProcessEnv = process.env) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (env['NAQLA_ENV'] !== 'production') res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  };
}
