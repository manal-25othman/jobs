import { Module } from '@nestjs/common';
import { Slice1Module } from '../slice1/slice1.module';
import { StorageModule } from '../storage/storage.module';
import { GitHubController, GitHubWebhookController } from './github.controller';
import { GitHubService } from './github.service';
import { TestRunService } from './test-run.service';
import { GITHUB_PORT } from './github.port';
import { SimulatedGitHub } from './simulated-github';

/**
 * GitHub source + R2 shadow runs. The port is the simulated TEST double when GITHUB_MODE=simulated; otherwise the
 * service answers "off" before touching it (a real GitHub App adapter is not implemented before approval).
 */
@Module({
  imports: [Slice1Module, StorageModule],
  controllers: [GitHubController, GitHubWebhookController],
  providers: [GitHubService, TestRunService, { provide: GITHUB_PORT, useFactory: () => (process.env['GITHUB_MODE'] === 'simulated' && process.env['NODE_ENV'] !== 'production' ? new SimulatedGitHub() : null) }],
  exports: [GitHubService, TestRunService, GITHUB_PORT],
})
export class GitHubModule {}
