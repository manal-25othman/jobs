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
