/**
 * @naqla/config — environment schema and validation.
 *
 * Deliberately dependency-free: a config loader that needs a package installed
 * before it can tell you the config is wrong is the wrong shape. It validates
 * at startup and throws with every problem listed at once, not the first.
 */

export type VarScope = 'web' | 'api' | 'both';

export interface VarSpec {
  readonly name: string;
  readonly scope: VarScope;
  readonly required: boolean;
  readonly secret: boolean;
  readonly description: string;
  /** Example shown in .env.example. Never a real value. */
  readonly example: string;
  readonly validate?: (value: string) => string | null;
}

const isUrl = (v: string): string | null => {
  try { new URL(v); return null; } catch { return 'must be an absolute URL'; }
};
const isPostgres = (v: string): string | null =>
  /^postgres(ql)?:\/\//.test(v) ? null : 'must be a postgres:// connection string';
const nonEmpty = (v: string): string | null => (v.trim() === '' ? 'must not be empty' : null);
const oneOf = (...allowed: string[]) => (v: string): string | null =>
  allowed.includes(v) ? null : `must be one of: ${allowed.join(', ')}`;

/**
 * The full environment contract.
 *
 * Phase 0 deliberately contains no model-provider keys: there are no AI calls
 * yet, and OPEN-023 (provider data-processing terms) is unresolved. Adding a
 * key here before that review would invite a call that should not happen.
 */
export const ENV_SPEC: readonly VarSpec[] = [
  { name: 'NODE_ENV', scope: 'both', required: true, secret: false,
    description: 'Runtime mode.', example: 'development',
    validate: oneOf('development', 'test', 'production') },

  { name: 'NAQLA_ENV', scope: 'both', required: false, secret: false,
    description: 'Deployment: development (local), staging (private trial, synthetic data, invited testers only) or production (future launch). REQUIRED when NODE_ENV=production. Staging gets every infrastructure protection of production (real storage, CORS, budgets) but keeps the labelled pilot content and test doubles; untrusted code never runs on it.',
    example: 'development', validate: oneOf('development', 'staging', 'production') },

  { name: 'STAGING_ALLOWED_EMAILS', scope: 'api', required: false, secret: false,
    description: 'Staging only: comma-separated e-mail addresses (or @domain suffixes) allowed to use the API. Everyone else is refused even with a valid session. REQUIRED when NAQLA_ENV=staging.',
    example: 'owner@example.org,@testers.example.org', validate: (v) => (v.split(',').every((x) => /^(@[a-z0-9.-]+\.[a-z]{2,}|[^@\s,]+@[a-z0-9.-]+\.[a-z]{2,})$/i.test(x.trim())) ? null : 'must be comma-separated e-mails or @domain suffixes') },

  { name: 'PILOT_STAGING_DECISION', scope: 'api', required: false, secret: false,
    description: 'Staging only, data CLI: the owner decision id (D-nnn) that allows publishing the labelled DEMO pilot in the private staging database. Unset: refused (D-136 is local-only by default). Refused in production.',
    example: '', validate: (v) => (/^D-\d{3}$/.test(v) ? null : 'must be a decision id like D-149') },

  { name: 'RATE_LIMIT_PER_MINUTE', scope: 'api', required: false, secret: false,
    description: 'Requests per minute per client (IP + user) before 429. Unset outside production/staging: no limit (tests). Default 120 when NODE_ENV=production.',
    example: '120', validate: (v) => (/^[1-9][0-9]{0,4}$/.test(v) ? null : 'must be a positive integer') },

  { name: 'NAQLA_DEPLOY_REGION', scope: 'both', required: true, secret: false,
    description:
      'The region this deployment stores data in. Required because D-004 makes data residency ' +
      'a documented decision, and an unnamed region cannot be documented.',
    example: 'unset-pending-OPEN-022', validate: nonEmpty },

  { name: 'NEXT_PUBLIC_APP_URL', scope: 'web', required: true, secret: false,
    description: 'Public origin of the Next.js app.', example: 'http://localhost:3000',
    validate: isUrl },

  { name: 'NEXT_PUBLIC_API_URL', scope: 'web', required: true, secret: false,
    description: 'Origin of the NestJS API the web app talks to.', example: 'http://localhost:3001',
    validate: isUrl },

  { name: 'NEXT_PUBLIC_SUPABASE_URL', scope: 'both', required: true, secret: false,
    description: 'Supabase project URL.', example: 'http://localhost:54321', validate: isUrl },

  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', scope: 'both', required: true, secret: false,
    description:
      'Supabase anon key. Public by design: it is only safe because RLS denies by default. ' +
      'If RLS is ever disabled on a table, this key becomes a data leak.',
    example: 'local-anon-key', validate: nonEmpty },

  { name: 'SUPABASE_SERVICE_ROLE_KEY', scope: 'api', required: true, secret: true,
    description:
      'Service role key. BYPASSES RLS. API only — never sent to the browser, never in a ' +
      'NEXT_PUBLIC_ variable, and used only in paths that do their own authorisation.',
    example: 'local-service-role-key', validate: nonEmpty },

  { name: 'DATABASE_URL', scope: 'api', required: true, secret: true,
    description: 'Postgres connection string for migrations and the job queue.',
    example: 'postgresql://postgres:postgres@localhost:54322/postgres', validate: isPostgres },

  { name: 'API_PORT', scope: 'api', required: false, secret: false,
    description: 'Port for the NestJS API. Defaults to 3001.', example: '3001',
    validate: (v) => (/^\d+$/.test(v) ? null : 'must be a port number') },

  { name: 'JOB_QUEUE_DRIVER', scope: 'api', required: false, secret: false,
    description:
      'Queue implementation. Postgres-backed by decision, kept swappable on purpose.',
    example: 'postgres', validate: oneOf('postgres', 'memory') },

  { name: 'STORAGE_BUCKET_PREFIX', scope: 'api', required: false, secret: false,
    description: 'Prefix for Supabase Storage buckets, so environments cannot collide.',
    example: 'dev', validate: nonEmpty },

  { name: 'SUPABASE_JWT_SECRET', scope: 'api', required: true, secret: true,
    description: 'The Supabase project JWT secret. The API verifies every access token signature with it.',
    example: 'local-jwt-secret-change-me', validate: nonEmpty },
  { name: 'SUPABASE_JWKS_URL', scope: 'api', required: false, secret: false,
    description: 'Optional. The project\'s public signing keys (https://<project>.supabase.co/auth/v1/.well-known/jwks.json). When set, tokens signed with asymmetric keys (ES256/RS256) are verified against it; HS256 tokens still use SUPABASE_JWT_SECRET.',
    example: '', validate: (v) => (/^https:\/\/[^\s]+\/\.well-known\/jwks\.json$/.test(v) ? null : 'must be an https URL ending in /.well-known/jwks.json') },

  { name: 'STORAGE_DRIVER', scope: 'api', required: false, secret: false,
    description: 'supabase (default) or memory. memory is refused when NODE_ENV=production.',
    example: 'supabase', validate: oneOf('supabase', 'memory') },

  { name: 'UPLOAD_MAX_BYTES', scope: 'api', required: false, secret: false,
    description: 'Maximum accepted upload size in bytes. Defaults to 10 MiB.', example: '10485760',
    validate: (v) => (/^\d+$/.test(v) ? null : 'must be an integer') },

  { name: 'AGENT_PROVIDER', scope: 'api', required: false, secret: false,
    description: 'Agent provider. Only local-test exists (TEST/NON-PRODUCTION); refused when NODE_ENV=production. A real provider arrives after OPEN-023.',
    example: 'local-test', validate: oneOf('local-test') },

  { name: 'AGENT_BUDGET_CALLS_PER_DAY', scope: 'api', required: false, secret: false,
    description: 'Per-user daily cap on agent invocations. Development default 50. REQUIRED in production: the real value is TBD until a provider is connected and cost is measured (D-073).', example: '50',
    validate: (v) => (/^\d+$/.test(v) ? null : 'must be an integer') },

  { name: 'CORS_ALLOWED_ORIGINS', scope: 'api', required: false, secret: false,
    description: 'Comma-separated browser origins allowed to call the API (e.g. the app URL). REQUIRED in production, where "*" is refused. Unset outside production: any origin (development only). S0, backlog P0-3.',
    example: 'http://localhost:3000', validate: (v) => (v.split(',').every((o) => o.trim() === '*' || /^https?:\/\/[^/\s]+$/.test(o.trim())) ? null : 'must be comma-separated origins like https://app.example.com') },

  { name: 'LEARNING_CANDIDATE_PREVIEW', scope: 'api', required: false, secret: false,
    description: 'off (default) or internal. internal shows UNVERIFIED candidate learning resources, labelled and audited, to internal testers in a development deployment that shows demo content. Refused when NODE_ENV=production (Phase B, PO decision 2).',
    example: 'off', validate: oneOf('off', 'internal') },

  { name: 'GITHUB_MODE', scope: 'api', required: false, secret: false,
    description: 'off (default) or simulated. simulated is an in-memory TEST double of the GitHub App integration with synthetic repositories; no GitHub request is ever made. Refused when NODE_ENV=production. A real GitHub App arrives only after the owner approves the design (Phase C round 2, item 1).',
    example: 'off', validate: oneOf('off', 'simulated', 'app') },

  { name: 'GITHUB_APP_ID', scope: 'api', required: false, secret: false, description: 'GITHUB_MODE=app: the numeric App ID (staging App only until production is approved).', example: '', validate: (v) => (/^\d{1,12}$/.test(v) ? null : 'must be numeric') },
  { name: 'GITHUB_APP_SLUG', scope: 'api', required: false, secret: false, description: 'GITHUB_MODE=app: the App slug used for the install link https://github.com/apps/<slug>/installations/new.', example: '', validate: (v) => (/^[a-z0-9-]{1,60}$/.test(v) ? null : 'must be the lowercase slug') },
  { name: 'GITHUB_APP_CLIENT_ID', scope: 'api', required: false, secret: false, description: 'GITHUB_MODE=app: the App client ID (user authorization during install).', example: '' },
  { name: 'GITHUB_APP_CLIENT_SECRET', scope: 'api', required: false, secret: true, description: 'GITHUB_MODE=app: the App client secret. Hosting secret store only.', example: '' },
  { name: 'GITHUB_APP_PRIVATE_KEY', scope: 'api', required: false, secret: true, description: 'GITHUB_MODE=app: the App private key (PEM; \\n-escaped newlines accepted). Hosting secret store only; rotate on any doubt.', example: '' },
  { name: 'GITHUB_APP_STATE_SECRET', scope: 'api', required: false, secret: true, description: 'GITHUB_MODE=app: ≥ 32 random characters signing the install state (CSRF protection of the install callback).', example: '', validate: (v) => (v.length >= 32 ? null : 'must be at least 32 characters') },
  { name: 'GITHUB_API_BASE', scope: 'api', required: false, secret: false, description: 'GITHUB_MODE=app: API base URL (default https://api.github.com). Tests point it at a local mock.', example: '' },

  { name: 'GITHUB_WEBHOOK_SECRET', scope: 'api', required: false, secret: true,
    description: 'Secret that signs GitHub webhook deliveries (X-Hub-Signature-256). Required when GITHUB_MODE is not off; at least 32 characters.',
    example: '', validate: (v) => (v.length >= 32 ? null : 'must be at least 32 characters') },

  { name: 'R2_MODE', scope: 'api', required: false, secret: false,
    description: 'off (default), synthetic_dev or recorded. synthetic_dev runs team-written test packs on SYNTHETIC code in the development namespace sandbox (apps/runner), in shadow mode — local development only. recorded serves results recorded earlier by the development runner for the simulated GitHub snapshots (labelled as recorded; no code runs) — for staging. Untrusted code never runs on the API host.',
    example: 'off', validate: oneOf('off', 'synthetic_dev', 'recorded') },

  { name: 'LOG_LEVEL', scope: 'both', required: false, secret: false,
    description: 'Structured log level.', example: 'info',
    validate: oneOf('debug', 'info', 'warn', 'error') },
];

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
  constructor(readonly problems: readonly string[]) {
    super(
      `Configuration is invalid:\n` +
      problems.map((p) => `  - ${p}`).join('\n') +
      `\n\nSee .env.example and docs/architecture/LOCAL-DEVELOPMENT.md.`,
    );
  }
}

export interface LoadOptions {
  readonly scope: 'web' | 'api';
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/** Validates the environment for one scope and returns the resolved values. */
export function loadEnv(opts: LoadOptions): Readonly<Record<string, string>> {
  const env = opts.env ?? (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
  const problems: string[] = [];
  const resolved: Record<string, string> = {};

  for (const spec of ENV_SPEC) {
    if (spec.scope !== 'both' && spec.scope !== opts.scope) continue;
    const raw = env[spec.name];
    if (raw === undefined || raw === '') {
      if (spec.required) problems.push(`${spec.name} is required (${spec.description})`);
      continue;
    }
    const problem = spec.validate?.(raw);
    if (problem) problems.push(`${spec.name} ${problem}`);
    else resolved[spec.name] = raw;
  }

  // A service-role key must never travel under a NEXT_PUBLIC_ name.
  for (const key of Object.keys(env)) {
    if (key.startsWith('NEXT_PUBLIC_') && /SERVICE_ROLE|SECRET|PRIVATE_KEY/i.test(key)) {
      problems.push(`${key} exposes a secret to the browser; rename it without the NEXT_PUBLIC_ prefix`);
    }
  }

  if (env['NODE_ENV'] === 'production' && !env['AGENT_BUDGET_CALLS_PER_DAY']) {
    problems.push('AGENT_BUDGET_CALLS_PER_DAY is required in production; 50/day is a development default, not a product value (D-073)');
  }
  // Deployment: staging keeps the infrastructure rules of production but may show labelled pilot content and test doubles.
  const deploy = env['NAQLA_ENV'] ?? (env['NODE_ENV'] === 'production' ? 'production' : 'development');
  if (env['NODE_ENV'] === 'production' && !env['NAQLA_ENV']) {
    problems.push('NAQLA_ENV is required when NODE_ENV=production (staging or production) so a private trial is never mistaken for a launch');
  }
  if (env['NAQLA_ENV'] === 'production' && env['NODE_ENV'] !== 'production') problems.push('NAQLA_ENV=production needs NODE_ENV=production');
  const realProduction = deploy === 'production';
  if (deploy === 'staging' && !env['STAGING_ALLOWED_EMAILS']) {
    problems.push('STAGING_ALLOWED_EMAILS is required in staging: only invited testers may use it');
  }
  if (realProduction && env['AGENT_PROVIDER'] === 'local-test') {
    problems.push('AGENT_PROVIDER=local-test is TEST/NON-PRODUCTION and is refused in production (OPEN-023 unresolved)');
  }
  if (env['NODE_ENV'] === 'production' && (!env['CORS_ALLOWED_ORIGINS'] || env['CORS_ALLOWED_ORIGINS'].split(',').some((o) => o.trim() === '*'))) {
    problems.push('CORS_ALLOWED_ORIGINS is required in production and may not be "*" (backlog P0-3)');
  }
  if (realProduction && env['LEARNING_CANDIDATE_PREVIEW'] === 'internal') {
    problems.push('LEARNING_CANDIDATE_PREVIEW=internal shows unverified learning resources and is refused in production (PO decision 2)');
  }
  if (realProduction && env['GITHUB_MODE'] === 'simulated') {
    problems.push('GITHUB_MODE=simulated is a test double and is refused in production; the real GitHub App is not approved yet');
  }
  if (env['GITHUB_MODE'] === 'app') {
    for (const k of ['GITHUB_APP_ID', 'GITHUB_APP_SLUG', 'GITHUB_APP_CLIENT_ID', 'GITHUB_APP_CLIENT_SECRET', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_APP_STATE_SECRET']) {
      if (!env[k]) problems.push(`${k} is required when GITHUB_MODE=app`);
    }
    if (realProduction) problems.push('GITHUB_MODE=app is approved for a separate development/staging App only; production needs its own approval');
  }
  if (env['GITHUB_MODE'] && env['GITHUB_MODE'] !== 'off' && !env['GITHUB_WEBHOOK_SECRET']) {
    problems.push('GITHUB_WEBHOOK_SECRET is required when GITHUB_MODE is not off (webhook deliveries must be verified)');
  }
  if (env['NODE_ENV'] === 'production' && env['R2_MODE'] === 'synthetic_dev') {
    problems.push('R2_MODE=synthetic_dev runs code in the development sandbox and is refused on any deployed host (staging or production): untrusted code never runs on the API host');
  }
  if (realProduction && env['R2_MODE'] === 'recorded') {
    problems.push('R2_MODE=recorded serves recorded results for simulated snapshots and is refused in production');
  }
  if (env['NODE_ENV'] === 'production' && env['STORAGE_DRIVER'] === 'memory') {
    problems.push('STORAGE_DRIVER=memory is a test double and is refused in production');
  }

  if (problems.length > 0) throw new ConfigError(problems);
  return Object.freeze(resolved);
}

/** Generates the contents of .env.example from the spec — one source of truth. */
export function renderEnvExample(): string {
  const lines: string[] = [
    '# NAQLA — local development environment',
    '# Generated from packages/config/src/index.ts (ENV_SPEC). Edit the spec, not this file.',
    '# Copy to .env.local and fill in. Never commit a filled-in copy.',
    '',
  ];
  for (const scope of ['both', 'web', 'api'] as const) {
    const vars = ENV_SPEC.filter((v) => v.scope === scope);
    if (vars.length === 0) continue;
    lines.push(`# ── ${scope === 'both' ? 'shared' : scope} ──`);
    for (const v of vars) {
      lines.push(`# ${v.description}`);
      if (v.secret) lines.push('# SECRET: server-side only. Never in a NEXT_PUBLIC_ variable.');
      lines.push(`${v.required ? '' : '# optional: '}${v.name}=${v.example}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

/** The deployment this process serves. Governance "production" (demo content refused, development-only rules off) is
 * true only for a real launch; staging keeps the pilot behaviour behind the infrastructure protections of production. */
export function deploymentEnv(env: Readonly<Record<string, string | undefined>> = process.env): 'development' | 'staging' | 'production' {
  const v = env['NAQLA_ENV'];
  if (v === 'development' || v === 'staging' || v === 'production') return v;
  return env['NODE_ENV'] === 'production' ? 'production' : 'development';
}

/** S0 / P0-3: the CORS origin rule. Outside production with nothing set, any origin (development); else the list. */
export function corsOrigins(env: Readonly<Record<string, string | undefined>>): true | string[] {
  const raw = env['CORS_ALLOWED_ORIGINS'];
  if (!raw) {
    if (env['NODE_ENV'] === 'production') throw new ConfigError(['CORS_ALLOWED_ORIGINS is required in production']);
    return true;
  }
  const list = raw.split(',').map((o) => o.trim()).filter(Boolean);
  if (list.includes('*')) {
    if (env['NODE_ENV'] === 'production') throw new ConfigError(['CORS_ALLOWED_ORIGINS may not be "*" in production']);
    return true;
  }
  return list;
}
