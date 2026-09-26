import { Controller, Get } from '@nestjs/common';
import {
  INVARIANTS, EVIDENCE_STATES, TRANSITIONS, FORBIDDEN_TRANSITIONS,
  EVALUATION_OUTCOMES, VERIFICATION_OUTCOMES,
} from '@naqla/domain';
import { SLICE_1_ENDPOINTS } from '@naqla/contracts';

/**
 * Reads the rules out of @naqla/domain and serves them as-is.
 *
 * It exists to prove the boundary: the API can SEE the rules and cannot
 * restate them. Every value below is imported; none is written here. If a rule
 * changes in the domain package, this endpoint changes with it automatically.
 */
@Controller('domain')
export class DomainInfoController {
  @Get('invariants')
  invariants() {
    return { ok: true, data: INVARIANTS };
  }

  @Get('evidence-model')
  evidenceModel() {
    return {
      ok: true,
      data: {
        states: EVIDENCE_STATES,
        permittedTransitions: TRANSITIONS,
        forbiddenTransitions: FORBIDDEN_TRANSITIONS,
        evaluationOutcomes: EVALUATION_OUTCOMES,
        verificationOutcomes: VERIFICATION_OUTCOMES,
      },
    };
  }

  @Get('planned-endpoints')
  plannedEndpoints() {
    return {
      ok: true,
      data: { note: 'Contracts only. Not implemented in Phase 0.', endpoints: SLICE_1_ENDPOINTS },
    };
  }
}
