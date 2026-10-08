/**
 * Career claim drafts and policy-driven eligibility (Phase 7, D-114).
 *
 * A career claim (a CV line, a LinkedIn headline, a case-study statement…) is
 * eligible only when its evidence meets the claim policy that is ACTIVE for
 * its kind. The policy is versioned configuration (claim_policy); this module
 * holds the evaluator, never the thresholds.
 *
 * Replacing presentationFor(). presentationFor() hard-coded where a claim at a
 * given state may appear. The migration-created baseline `legacy_presentation@1`
 * holds exactly those levels as data, and `presentationFromClaimPolicies()`
 * rebuilds presentationFor()'s output from policies through the SAME evaluator
 * the product uses. An exhaustive test proves the two equal for every state.
 * presentationFor() stays in code as the frozen reference and rollback target.
 *
 * What is structural (code): which kinds assert a skill and which only mention
 * a project; which kinds may exist without an evidence reference (the existing
 * validation exemption). What is configuration (DRAFT / NOT VALIDATED until an
 * expert approves): every level, count and source-strength floor.
 *
 * The flow is fixed: Evidence → Proposed Claim → User Preview → User Approval →
 * Professional Asset. Nothing here approves, publishes or writes anything.
 */

import { DomainError } from './errors.js';
import {
  EVIDENCE_STATES, SOURCE_STRENGTHS, evidenceOrdinal,
  type EvidenceState, type EvidenceSourceStrength, type PresentationEligibility,
} from './evidence-state.js';
import { CLAIM_KINDS, assertClaimPolicySane, type ClaimKind, type ClaimPolicy, type ConfigResolution } from './configuration.js';

/** A skill assertion names a skill as something the user can do; a mention only describes work done. */
export type ClaimKindClass = 'skill_assertion' | 'mention';

export const CLAIM_KIND_CLASS: Readonly<Record<ClaimKind, ClaimKindClass>> = {
  cv_bullet: 'skill_assertion',
  project_description: 'mention',
  linkedin_skill: 'skill_assertion',
  linkedin_project: 'mention',
  linkedin_headline: 'skill_assertion',
  linkedin_about: 'skill_assertion',
  professional_summary: 'skill_assertion',
  case_study: 'skill_assertion',
  professional_profile: 'skill_assertion',
  evidence_report: 'skill_assertion',
};

/**
 * Kinds that may exist without an evidence reference — the exemption the
 * proposal validation already made (headline, about, summary). Any skill they
 * name still has to meet the policy.
 */
export const CLAIM_KINDS_WITHOUT_EVIDENCE_REF: ReadonlySet<ClaimKind> = new Set<ClaimKind>(['linkedin_headline', 'linkedin_about', 'professional_summary']);

/** The kinds a user can receive as a claim draft in Phase 7. */
export const DRAFTABLE_CLAIM_KINDS = [
  'professional_summary', 'cv_bullet', 'project_description', 'linkedin_headline', 'linkedin_about', 'linkedin_skill', 'linkedin_project', 'case_study',
] as const satisfies readonly ClaimKind[];
export type DraftableClaimKind = (typeof DRAFTABLE_CLAIM_KINDS)[number];

/** Which claim a wording proposal type drafts. Non-wording proposal types draft no claim. */
const KIND_BY_PROPOSAL_TYPE: Readonly<Record<string, DraftableClaimKind>> = {
  cv_bullet: 'cv_bullet', cv_rewrite: 'cv_bullet', project_description: 'project_description', professional_summary: 'professional_summary',
  linkedin_headline: 'linkedin_headline', linkedin_about: 'linkedin_about', linkedin_skill: 'linkedin_skill', linkedin_project: 'linkedin_project',
  linkedin_featured: 'case_study', case_study: 'case_study',
};
export function claimKindForProposalType(proposalType: string): DraftableClaimKind | null {
  return KIND_BY_PROPOSAL_TYPE[proposalType] ?? null;
}

/** The professional_asset.kind an approved claim becomes. Historical assets keep the kind they were approved with. */
export function assetKindForClaimKind(kind: DraftableClaimKind): DraftableClaimKind { return kind; }

/** The levels presentationFor() hard-coded, as the baseline rows hold them. The e2e suite proves the database rows equal this. */
export const LEGACY_PRESENTATION_BASELINE: Readonly<Record<DraftableClaimKind, EvidenceState | null>> = {
  cv_bullet: 'demonstrated',          // presentationFor().cv === 'bullet'
  project_description: 'practiced',   // presentationFor().cv === 'project_description_only'
  linkedin_skill: 'demonstrated',     // presentationFor().linkedIn === 'skill'
  linkedin_project: 'practiced',      // presentationFor().linkedIn === 'project_mention_only'
  // Not in presentationFor(): the pre-Phase-7 proposal validation's rule (a named skill needs demonstrated).
  professional_summary: 'demonstrated', linkedin_headline: 'demonstrated', linkedin_about: 'demonstrated',
  // No pre-existing behaviour: no baseline. Production refuses it until a validated policy exists.
  case_study: null,
};

/* ─────────────────────────────── eligibility ─────────────────────────────── */

export interface ClaimSubject {
  /** Skills the wording asserts (named by id or written into the text), with their current state. */
  readonly assertedSkills: readonly { readonly skillId: string; readonly state: EvidenceState }[];
  /** Evidence the claim cites, with the state of the skill it is evidence for. */
  readonly citedEvidence: readonly {
    readonly evidenceId: string; readonly skillId: string; readonly state: EvidenceState;
    readonly sourceStrength: EvidenceSourceStrength; readonly standing: boolean;
  }[];
  /** Standing (not withdrawn) evidence rows per skill. */
  readonly standingEvidenceCount: Readonly<Record<string, number>>;
  /** Skills with a recorded verification decision. */
  readonly skillsWithVerificationDecision: ReadonlySet<string>;
}

export interface ResolvedClaimPolicy { readonly policy: ClaimPolicy; readonly resolution: ConfigResolution }

export type ClaimEligibility =
  | { readonly status: 'eligible'; readonly policyRef: string; readonly resolution: ConfigResolution; readonly checked: readonly string[] }
  | { readonly status: 'not_eligible'; readonly policyRef: string; readonly resolution: ConfigResolution; readonly reasons: readonly ClaimReason[] }
  | { readonly status: 'not_yet_configured'; readonly policyRef: null; readonly reasons: readonly ClaimReason[] };

/** Every reason carries an English line for the record and an Arabic line a graduate can read. */
export interface ClaimReason { readonly code: string; readonly en: string; readonly ar: string }

const STATE_AR: Readonly<Record<EvidenceState, string>> = {
  gap: 'بلا دليل', self_reported: 'مُعلَنة ذاتيًا', practiced: 'مُمارَسة', demonstrated: 'مُثبَتة', verified: 'مُتحقَّق منها',
};
const strengthRank = (s: EvidenceSourceStrength): number => SOURCE_STRENGTHS.length - SOURCE_STRENGTHS.indexOf(s);

export function claimPolicyRef(p: Pick<ClaimPolicy, 'key' | 'version'>): string { return `${p.key}@${p.version}`; }

/**
 * Pure: may a claim of this kind exist, given its evidence and the policy
 * active for the kind? No policy is never "allowed by default".
 */
export function claimEligibility(kind: ClaimKind, resolved: ResolvedClaimPolicy | null, subject: ClaimSubject): ClaimEligibility {
  if (!(CLAIM_KINDS as readonly string[]).includes(kind)) throw new DomainError(`unknown claim kind '${kind}'`);
  if (!resolved) {
    return { status: 'not_yet_configured', policyRef: null, reasons: [{ code: 'policy_not_configured',
      en: `no claim policy is active for '${kind}' in this environment; the claim cannot be drafted`,
      ar: 'معيار هذا النوع من الصياغات المهنية قيد الاعتماد، فلا يمكن اقتراحه بعد.' }] };
  }
  const { policy, resolution } = resolved;
  assertClaimPolicySane(policy);
  if (policy.claimKind !== kind) throw new DomainError(`claim policy ${claimPolicyRef(policy)} is for '${policy.claimKind}', not '${kind}'`);
  const ref = claimPolicyRef(policy);
  const reasons: ClaimReason[] = [];
  const checked: string[] = [];

  for (const e of subject.citedEvidence) {
    if (!e.standing) reasons.push({ code: 'evidence_withdrawn', en: `evidence '${e.evidenceId}' was withdrawn`, ar: 'سُحب أحد الأدلة التي يستند إليها هذا الاقتراح.' });
  }
  if (!CLAIM_KINDS_WITHOUT_EVIDENCE_REF.has(kind) && subject.citedEvidence.length === 0) {
    reasons.push({ code: 'evidence_missing', en: `a '${kind}' claim needs at least one evidence reference`, ar: 'هذا النوع من الصياغات يحتاج دليلًا واحدًا على الأقل.' });
  }
  checked.push('evidence_standing');

  // The subject: the skill(s) whose state decides. A mention is judged by the
  // evidence it describes; a skill assertion also by every skill it asserts.
  const subjectStates: { skillId: string; state: EvidenceState }[] = subject.citedEvidence.map((e) => ({ skillId: e.skillId, state: e.state }));
  if (CLAIM_KIND_CLASS[kind] === 'skill_assertion') subjectStates.push(...subject.assertedSkills);
  for (const s of subjectStates) {
    if (evidenceOrdinal(s.state) < evidenceOrdinal(policy.minEvidenceLevel)) {
      reasons.push({ code: 'level_below_policy',
        en: `skill '${s.skillId}' is '${s.state}'; policy ${ref} requires '${policy.minEvidenceLevel}' for '${kind}'`,
        ar: `مستوى الدليل الحالي «${STATE_AR[s.state]}»، وهذا النوع يحتاج «${STATE_AR[policy.minEvidenceLevel]}» على الأقل.` });
    }
  }
  checked.push('evidence_level');

  if (policy.minEvidenceCount !== null) {
    for (const skillId of new Set(subjectStates.map((s) => s.skillId))) {
      const n = subject.standingEvidenceCount[skillId] ?? 0;
      if (n < policy.minEvidenceCount) reasons.push({ code: 'evidence_count_below_policy',
        en: `skill '${skillId}' has ${n} standing evidence record(s); policy ${ref} requires ${policy.minEvidenceCount}`,
        ar: `عدد الأدلة القائمة ${n}، والمطلوب ${policy.minEvidenceCount}.` });
    }
    checked.push('evidence_count');
  }
  if (policy.minSourceStrength !== null) {
    for (const e of subject.citedEvidence) {
      if (strengthRank(e.sourceStrength) < strengthRank(policy.minSourceStrength)) reasons.push({ code: 'source_strength_below_policy',
        en: `evidence '${e.evidenceId}' comes from '${e.sourceStrength}'; policy ${ref} requires '${policy.minSourceStrength}' or stronger`,
        ar: 'مصدر الدليل أضعف مما يتطلبه هذا النوع من الصياغات.' });
    }
    checked.push('source_strength');
  }
  if (policy.requiresVerificationDecision) {
    for (const skillId of new Set(subjectStates.map((s) => s.skillId))) {
      if (!subject.skillsWithVerificationDecision.has(skillId)) reasons.push({ code: 'verification_decision_missing',
        en: `policy ${ref} requires a recorded verification decision for skill '${skillId}'`,
        ar: 'هذا النوع يحتاج قرار تحقق مسجّلًا للمهارة.' });
    }
    checked.push('verification_decision');
  }

  return reasons.length > 0
    ? { status: 'not_eligible', policyRef: ref, resolution, reasons }
    : { status: 'eligible', policyRef: ref, resolution, checked };
}

/* ───────────────────────── presentationFor() equivalence ───────────────────────── */

/**
 * Rebuilds presentationFor(state) from claim policies, through claimEligibility()
 * itself: one evidence record (platform-controlled, standing) at `state`, and —
 * for a skill assertion — that same skill asserted. With the legacy baseline,
 * the result must equal presentationFor(state) for every state.
 */
export function presentationFromClaimPolicies(policies: Partial<Record<ClaimKind, ResolvedClaimPolicy | null>>, state: EvidenceState): PresentationEligibility {
  if (!(EVIDENCE_STATES as readonly string[]).includes(state)) throw new DomainError(`unknown state '${state}'`);
  const subject: ClaimSubject = {
    assertedSkills: [{ skillId: 'subject', state }],
    citedEvidence: [{ evidenceId: 'evidence', skillId: 'subject', state, sourceStrength: 'platform_controlled', standing: true }],
    standingEvidenceCount: { subject: 1 }, skillsWithVerificationDecision: new Set(),
  };
  const ok = (k: ClaimKind): boolean => claimEligibility(k, policies[k] ?? null, subject).status === 'eligible';
  const cv: PresentationEligibility['cv'] = ok('cv_bullet') ? 'bullet' : ok('project_description') ? 'project_description_only' : 'no';
  const linkedIn: PresentationEligibility['linkedIn'] = ok('linkedin_skill') ? 'skill' : ok('linkedin_project') ? 'project_mention_only' : 'no';
  return {
    publiclyDisplayable: cv !== 'no' || linkedIn !== 'no',
    cv, linkedIn,
    unsupportedIfClaimedAsExpertise: cv !== 'bullet' && linkedIn !== 'skill',
    // A gap was never claimed; anything the user claims that no channel allows is flagged if it is on the CV.
    flagIfPresentInCv: state !== 'gap' && cv === 'no',
  };
}

/* ─────────────────────────────── draft grounding ─────────────────────────────── */

/**
 * Grounding status of a claim draft, recorded with it:
 *   grounded            passed every grounding check and its policy when drafted
 *   evidence_withdrawn  evidence it cites was withdrawn after drafting (it can no longer be approved)
 *   not_eligible        a re-check against the policy active at approval refused it
 */
export const CLAIM_GROUNDING_STATUSES = ['grounded', 'evidence_withdrawn', 'not_eligible'] as const;
export type ClaimGroundingStatus = (typeof CLAIM_GROUNDING_STATUSES)[number];

/** Arabic labels a graduate reads on the claim-draft page. */
export const CLAIM_KIND_LABEL_AR: Readonly<Record<DraftableClaimKind, string>> = {
  professional_summary: 'ملخّص السيرة', cv_bullet: 'بند في السيرة', project_description: 'وصف مشروع في السيرة',
  linkedin_headline: 'عنوان لينكدإن', linkedin_about: 'نبذة لينكدإن', linkedin_skill: 'مهارة في لينكدإن',
  linkedin_project: 'مشروع في لينكدإن', case_study: 'دراسة حالة / بورتفوليو',
};

/* ───────────────────── approval vs current standing (Phase 7b, BR-026 · DR-019) ───────────────────── */

/**
 * May an approved asset be presented as evidence-backed NOW? The approval is
 * history and never changes; this is the separate, current answer. Fail closed:
 *   - it must be active, evidence-backed and user-approved (D-077 as before);
 *   - it must have been verified under the claim policy in effect now
 *     (`standingPolicyId`, else the policy it was approved under);
 *   - an asset approved before the policy layer counts as verified under the
 *     legacy baseline, and only while that baseline is what is in effect;
 *   - no policy in effect for its kind ⇒ not presentable.
 * A policy activated without re-checking assets therefore hides them until
 * they are re-checked — it never leaves them shown under an obsolete decision.
 */
export interface AssetStanding {
  readonly lifecycleState: string;
  readonly evidenceBacked: boolean;
  readonly userApprovedAt: string | null;
  readonly standingPolicyId: string | null;
  readonly claimPolicyId: string | null;
}
export function assetPresentableNow(a: AssetStanding, inEffect: { readonly policyId: string; readonly resolution: ConfigResolution } | null):
  { readonly presentable: boolean; readonly reason: 'presentable' | 'not_active' | 'not_evidence_backed' | 'not_approved' | 'no_policy_in_effect' | 'not_verified_under_policy_in_effect' } {
  if (a.lifecycleState !== 'active') return { presentable: false, reason: 'not_active' };
  if (!a.evidenceBacked) return { presentable: false, reason: 'not_evidence_backed' };
  if (!a.userApprovedAt) return { presentable: false, reason: 'not_approved' };
  if (!inEffect) return { presentable: false, reason: 'no_policy_in_effect' };
  const verifiedUnder = a.standingPolicyId ?? a.claimPolicyId;
  if (verifiedUnder === null) return inEffect.resolution === 'legacy_baseline' ? { presentable: true, reason: 'presentable' } : { presentable: false, reason: 'not_verified_under_policy_in_effect' };
  return verifiedUnder === inEffect.policyId ? { presentable: true, reason: 'presentable' } : { presentable: false, reason: 'not_verified_under_policy_in_effect' };
}
