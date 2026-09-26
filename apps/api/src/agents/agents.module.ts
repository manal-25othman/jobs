import { Module } from '@nestjs/common';
import { DbService } from '../infra/db.service';
import { AgentService, AGENT_GATEWAY, buildGateway } from './agent.service';
import { AgentsController } from './agents.controller';

@Module({
  controllers: [AgentsController],
  providers: [{ provide: AGENT_GATEWAY, useFactory: (db: DbService) => buildGateway(db), inject: [DbService] }, AgentService],
  exports: [AgentService],
})
export class AgentsModule {}
