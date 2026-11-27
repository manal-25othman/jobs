import { isProduction } from '../configuration/configuration.service';
import { Module } from '@nestjs/common';
import { Slice1Module } from '../slice1/slice1.module';
import { StorageModule } from '../storage/storage.module';
import { GitHubController, GitHubWebhookController } from './github.controller';
import { GitHubService } from './github.service';
import { TestRunService } from './test-run.service';
import { GITHUB_PORT } from './github.port';
import { SimulatedGitHub } from './simulated-github';
import { GitHubAppAdapter } from './github-app.adapter';

/**
 * GitHub source + R2 shadow runs. The port is the simulated TEST double when GITHUB_MODE=simulated; otherwise the
 * service answers "off" before touching it (a real GitHub App adapter is not implemented before approval).
 */
/** The port for the configured mode: simulated double, real GitHub App adapter (staging/development only), or none. */
function githubPortFor(env: NodeJS.ProcessEnv) {
  if (isProduction()) return null;
  if (env['GITHUB_MODE'] === 'simulated') return new SimulatedGitHub();
  if (env['GITHUB_MODE'] === 'app') {
    return new GitHubAppAdapter({
      appId: env['GITHUB_APP_ID'] ?? '', privateKeyPem: (env['GITHUB_APP_PRIVATE_KEY'] ?? '').replace(/\\n/g, '\n'),
      clientId: env['GITHUB_APP_CLIENT_ID'] ?? '', clientSecret: env['GITHUB_APP_CLIENT_SECRET'] ?? '',
      ...(env['GITHUB_API_BASE'] ? { apiBase: env['GITHUB_API_BASE'] } : {}),
    });
  }
  return null;
}

@Module({
  imports: [Slice1Module, StorageModule],
  controllers: [GitHubController, GitHubWebhookController],
  providers: [GitHubService, TestRunService, { provide: GITHUB_PORT, useFactory: () => githubPortFor(process.env) }],
  exports: [GitHubService, TestRunService, GITHUB_PORT],
})
export class GitHubModule {}
