import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

/**
 * Two ways into the database, and the difference is the whole security model.
 *
 *   asUser(userId, fn)   runs inside a transaction as the `authenticated` role
 *                        with request.jwt.claim.sub set, so RLS applies exactly
 *                        as it would for a browser using the anon key.
 *
 *   asService(fn)        runs as the owning role, bypassing RLS. Every caller
 *                        MUST do its own authorisation first. Used only for
 *                        authoritative writes the user is forbidden to make
 *                        directly — evidence, claims, transitions, results.
 *
 * Reads that RLS already defines are run through asUser, so a policy bug shows
 * up as missing data in development rather than as a leak in production.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private pool!: Pool;

  onModuleInit(): void {
    this.pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
      max: Number(process.env['DB_POOL_MAX'] ?? 10),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  /** Raw pool access for health checks only. */
  async ping(): Promise<boolean> {
    try {
      await this.pool.query('select 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Runs `fn` in a transaction under the caller's own row level security.
   *
   * SET LOCAL is used deliberately here and is correct: we are inside an
   * explicit transaction, so the role and claim revert on COMMIT. (Outside a
   * transaction SET LOCAL is a silent no-op — the bug that made the first RLS
   * test pass while proving nothing.)
   */
  async asUser<T>(userId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      await client.query('set local role authenticated');
      const out = await fn(client);
      await client.query('commit');
      return out;
    } catch (e) {
      await client.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      // reset role is harmless after commit/rollback and stops a pooled
      // connection from being handed out still wearing a role.
      await client.query('reset role').catch(() => undefined);
      client.release();
    }
  }

  /**
   * Runs `fn` in a transaction with full privileges, bypassing RLS.
   *
   * The caller has already checked ownership. Everything inside one call is
   * atomic: that is what makes "evaluation passed but evidence not
   * transitioned" unrepresentable rather than merely unlikely.
   */
  async asService<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const out = await fn(client);
      await client.query('commit');
      return out;
    } catch (e) {
      await client.query('rollback').catch(() => undefined);
      this.logger.warn(`service transaction rolled back: ${(e as Error).message}`);
      throw e;
    } finally {
      client.release();
    }
  }
}
