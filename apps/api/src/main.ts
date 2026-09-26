/**
 * NAQLA API — Phase 0 bootstrap.
 *
 * This process starts, validates its configuration, and answers health and
 * readiness. It serves NO product endpoints: Phase 0 is architecture and
 * foundations, not features.
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { loadEnv, ConfigError } from '@naqla/config';
import { AppModule } from './app.module';

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

  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('v1', { exclude: ['health', 'ready'] });

  const port = Number(env['API_PORT'] ?? 3001);
  await app.listen(port);
  logger.log(`NAQLA API listening on ${port} (region: ${env['NAQLA_DEPLOY_REGION']})`);
}

void bootstrap();
