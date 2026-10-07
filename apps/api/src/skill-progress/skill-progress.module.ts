import { Module } from '@nestjs/common';
import { SkillProgressEngine } from './skill-progress-engine.service';
import { SkillProgressService } from './skill-progress.service';
import { SkillProgressController } from './skill-progress.controller';

/** Skill Status Model (Phase 2). The engine is exported so producing flows emit journey events in their own transaction. */
@Module({
  controllers: [SkillProgressController],
  providers: [SkillProgressEngine, SkillProgressService],
  exports: [SkillProgressEngine],
})
export class SkillProgressModule {}
