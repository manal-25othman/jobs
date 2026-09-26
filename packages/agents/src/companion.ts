/**
 * Career Companion presentation layer.
 *
 * Not an agent. It surfaces validated proposals in the companion's voice and
 * invents nothing: the text is a fixed template per proposal type, and the
 * only variable parts are copied from the proposal.
 */
import type { AgentProposal, ProposalLifecycle } from './contracts.js';

export interface CompanionNudge {
  readonly proposalId: string;
  readonly textAr: string;
  readonly actionHref: string;
}

const SURFACEABLE: ReadonlySet<ProposalLifecycle> = new Set(['validated', 'awaiting_user']);

export function nudgesFor(
  proposals: readonly (AgentProposal & { readonly lifecycle: ProposalLifecycle })[],
): CompanionNudge[] {
  const out: CompanionNudge[] = [];
  for (const p of proposals) {
    if (!SURFACEABLE.has(p.lifecycle)) continue;
    switch (p.proposalType) {
      case 'cv_bullet':
        out.push({ proposalId: p.proposalId, textAr: 'صار عندك بند جديد ممكن تضيفينه للسيرة — بعد معاينته.', actionHref: `/proposals?focus=${p.proposalId}` });
        break;
      case 'technical_feedback':
        out.push({ proposalId: p.proposalId, textAr: `عندك ملاحظة تقنية واحدة لو حسّنتيها بتقوّي دليلك: ${p.summary}`, actionHref: `/proposals?focus=${p.proposalId}` });
        break;
      case 'technical_next_action':
      case 'recruiter_next_action':
        out.push({ proposalId: p.proposalId, textAr: `خطوة صغيرة جاهزة: ${p.summary}`, actionHref: `/proposals?focus=${p.proposalId}` });
        break;
      default:
        break;
    }
  }
  return out.slice(0, 1); // never more than one nudge visible (frozen design §10)
}
