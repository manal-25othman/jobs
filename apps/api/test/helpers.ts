import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';

/**
 * E2E harness.
 *
 * Tokens are minted locally with the same HS256 secret and the same `sub`
 * claim Supabase Auth issues, so the guard under test is the real one. What is
 * NOT exercised here is Supabase's own issuance (signup, email, refresh) —
 * that needs a live project and is recorded as such in the slice report.
 */
export const JWT_SECRET = 'test-jwt-secret-for-e2e-only-not-a-real-key';

export async function makeToken(userId: string, email = 'user@example.test'): Promise<string> {
  return new SignJWT({ email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

export interface TestUser { id: string; token: string; }

export async function newUser(): Promise<TestUser> {
  const id = randomUUID();
  return { id, token: await makeToken(id) };
}

export async function bootApp(): Promise<INestApplication> {
  process.env['SUPABASE_JWT_SECRET'] = JWT_SECRET;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1', {
    // A share link may live for 90 days; it must not break on a version bump.
    exclude: ['health', 'ready', 'public/reports/:id'],
  });
  await app.init();
  return app;
}

/** Seeded demo fixture ids, from supabase/seed/0001_demo_role.sql. */
export const FIXTURE = {
  roleId: 'b0000000-0000-4000-8000-000000000001',
  activitySpecId: 'c0000000-0000-4000-8000-000000000001',
  skillUiTesting: 'a0000000-0000-4000-8000-000000000002',
} as const;

/** A submission that satisfies every mandatory criterion. */
export const COMPLETE_ARTIFACTS = [
  { key: 'file.component', kind: 'file' as const, valueText: 'HabitList.jsx', locator: 'HabitList.jsx' },
  { key: 'file.test', kind: 'file' as const, valueText: 'HabitList.test.jsx', locator: 'HabitList.test.jsx' },
  { key: 'test.empty_state', kind: 'boolean' as const, valueBool: true, locator: 'HabitList.test.jsx:12' },
  { key: 'test.loading_state', kind: 'boolean' as const, valueBool: true, locator: 'HabitList.test.jsx:28' },
  { key: 'test.error_message', kind: 'boolean' as const, valueBool: true, locator: 'HabitList.test.jsx:44' },
  { key: 'note.coverage', kind: 'text' as const,
    valueText: 'Covers empty, loading and error states; does not cover pagination.', locator: 'notes.md' },
  { key: 'signal.tests_reference_component', kind: 'boolean' as const, valueBool: true },
];

/** The same submission with the mandatory error-message test missing. */
export const INCOMPLETE_ARTIFACTS = COMPLETE_ARTIFACTS.filter((a) => a.key !== 'test.error_message');

/**
 * Asserts a statement is rejected, without poisoning the connection.
 *
 * A failed statement aborts the whole transaction in PostgreSQL, so every
 * later statement on that connection returns 25P02 and a released connection
 * carries the abort into the next test. A savepoint scopes the failure to the
 * one statement being tested.
 */
export async function expectRejected(
  client: import('pg').PoolClient,
  sql: string,
  params: unknown[],
  pattern: RegExp,
): Promise<void> {
  await client.query('savepoint expect_rejected');
  try {
    await client.query(sql, params);
    await client.query('release savepoint expect_rejected');
    throw new Error(`expected the statement to be rejected, but it succeeded: ${sql.slice(0, 60)}`);
  } catch (e) {
    const message = (e as Error).message;
    await client.query('rollback to savepoint expect_rejected');
    if (message.startsWith('expected the statement to be rejected')) throw e;
    if (!pattern.test(message)) {
      throw new Error(`rejected for the wrong reason: ${message} (expected ${pattern})`);
    }
  }
}

/** Runs `fn` as an authenticated user, and always leaves the connection clean. */
export async function asAuthenticatedUser<T>(
  pool: import('pg').Pool,
  userId: string,
  fn: (c: import('pg').PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await c.query('set local role authenticated');
    return await fn(c);
  } finally {
    await c.query('rollback').catch(() => undefined);
    await c.query('reset role').catch(() => undefined);
    c.release();
  }
}
