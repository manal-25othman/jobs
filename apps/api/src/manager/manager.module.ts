import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { ManagerService } from './manager.service';
import { ManagerController } from './manager.controller';

/** A11 Virtual Manager (FR-U-026) on the existing gateway; no new provider or data path beyond 0042. */
@Module({ imports: [AgentsModule], controllers: [ManagerController], providers: [ManagerService], exports: [ManagerService] })
export class ManagerModule {}
