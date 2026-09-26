import { Controller, Get } from '@nestjs/common';
import { CURRENT_API_VERSION } from '@naqla/contracts';
import { DOMAIN_RULESET_VERSION } from '@naqla/domain';

/**
 * Liveness and readiness.
 *
 * `/ready` reports what the process can actually do. In Phase 0 it reports
 * that no datastore is wired yet rather than claiming readiness it does not
 * have — a green check that means nothing is worse than a red one.
 */
@Controller()
export class HealthController {
  @Get('health')
  health(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Get('ready')
  ready(): {
    status: 'degraded';
    phase: 'phase-0';
    apiVersion: string;
    domainRuleset: string;
    checks: Record<string, 'not_wired' | 'ok'>;
  } {
    return {
      status: 'degraded',
      phase: 'phase-0',
      apiVersion: CURRENT_API_VERSION,
      domainRuleset: DOMAIN_RULESET_VERSION,
      checks: {
        config: 'ok',
        domain: 'ok',
        database: 'not_wired',
        storage: 'not_wired',
        jobQueue: 'not_wired',
        auth: 'not_wired',
      },
    };
  }
}
