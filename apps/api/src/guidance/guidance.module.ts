import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { Slice1Module } from '../slice1/slice1.module';
import { ReadinessModule } from '../readiness/readiness.module';
import { GuidanceTools } from './guidance.tools';
import { GuidanceService } from './guidance.service';
import { GuidanceController } from './guidance.controller';

/** Phase B package 5 — guidance on top of existing modules; no new agent, provider or data path. */
@Module({ imports: [AgentsModule, Slice1Module, ReadinessModule], controllers: [GuidanceController], providers: [GuidanceTools, GuidanceService] })
export class GuidanceModule {}
