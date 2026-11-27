/**
 * NAQLA API — Phase 0 bootstrap.
 *
 * This process starts, validates its configuration, and answers health and
 * readiness. It serves NO product endpoints: Phase 0 is architecture and
 * foundations, not features.
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { rateLimit, securityHeaders } from './infra/http-guards';
import { Logger } from '@nestjs/common';
import { loadEnv, ConfigError, corsOrigins } from '@naqla/config';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './infra/domain-exception.filter';

async function bootstrap(): Promise<void> {
  const logger = new Logger('bootstrap');

  // Fail fast and loudly: a misconfigured API should never accept a request.
  let env: Readonly<Record<string, string>>;
  try {
    env = loadEnv({ scope: 'api' });
  } catch (e) {
    if (e instanceof ConfigError) {
      logger.error(e.message);
      process.exit(1);
    }
    throw e;
  }

  // S0 / P0-3: an explicit origin allow-list in production (CORS_ALLOWED_ORIGINS); any origin only outside production.
  const app = await NestFactory.create(AppModule, { cors: { origin: corsOrigins(env) }, rawBody: true });
  // Behind the host's proxy (Railway/others) the client address is in X-Forwarded-For: trust exactly one hop.
  if (env['NODE_ENV'] === 'production') (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', 1);
  app.use(securityHeaders());
  app.use(rateLimit());
  app.useGlobalFilters(new DomainExceptionFilter());
  app.setGlobalPrefix('v1', {
    // A share link may live for 90 days; it must not break on a version bump.
    exclude: ['health', 'ready', 'public/reports/:id'],
  });

  // Hosts such as Railway inject PORT; API_PORT stays the local default.
  const port = Number(env['PORT'] ?? env['API_PORT'] ?? 3001);
  await app.listen(port);
  logger.log(`NAQLA API listening on ${port} (deployment: ${env['NAQLA_ENV'] ?? 'development'}, region: ${env['NAQLA_DEPLOY_REGION']})`);
}

void bootstrap();
