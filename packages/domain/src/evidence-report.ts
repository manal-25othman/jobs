/**
 * Career Evidence Report — the projection contract.
 *
 * This is a WHITELIST, not a filter. The report is built by naming the fields
 * that may appear; anything not named simply has no path into the output. A
 * blacklist would need updating every time a new column is added, and the
 * update would be forgotten exactly once.
 */

import { InvariantViolation } from './errors.js';
import { evidenceOrdinal, type EvidenceState } from './evidence-state.js';
import type { EvaluationOutcome } from './evaluation.js';

/* ─────────────────────────── what may appear ───────────────────────────── */

export const REPORT_ALLOWED_FIELDS = [
  'targetRole',
  'skill',
  'evidenceState',
  'source',
  'evaluationSummary',
  'integrityResult',
  'professionalAsset',
  'aiDisclosure',
  'generatedAt',
] as const;

export type ReportField = (typeof REPORT_ALLOWED_FIELDS)[number];

/**
 * What may NEVER appear, whatever the caller passes.
 *
 * Checked at build time against the produced object, so a future field that
 * happens to carry one of these names cannot slip through.
 */
export const REPORT_FORBIDDEN_KEYS: readonly string[] = [
  'rawUpload', 'raw_upload', 'filePath', 'objectPath', 'object_path', 'bucket',
  'privateNote', 'private_note', 'reviewerNote', 'justification',
  'conversation', 'companionConversation', 'prompt', 'aiPromptLog',
  'integrityDetail', 'integritySignal', 'assessmentOnly',
  'auditEvent', 'modelCall', 'tokenHash', 'token_hash',
  'email', 'internalId', 'serviceRoleKey',
  'signedUrl', 'signed_url', 'downloadUrl', 'uploadId', 'upload_id', 'declaredName', 'declared_name',
  'checksum', 'checksum_sha256',
];

/* ────────────────────────────── the report ─────────────────────────────── */

export interface ReportTargetRole {
  readonly label: string;
  readonly reviewStatus: 'reviewed' | 'draft' | 'incomplete';
}

export interface ReportSkillEntry {
  readonly skillLabel: string;
  readonly evidenceState: EvidenceState;
  /** Plain-language reason the skill sits at this state. */
  readonly stateReason: string;
  readonly source: {
    readonly projectTitle: string;
    readonly kind: 'platform_activity' | 'personal_project';
  };
  readonly evaluationSummary: {
    readonly outcome: EvaluationOutcome;
    readonly score: number;
    readonly maxScore: number;
    readonly rubricVersion: string;
    readonly evaluatedAt: string;
    /** Criterion labels and whether each was met. No internal ids. */
    readonly criteria: readonly {
      readonly label: string;
      readonly met: boolean;
      readonly rationale: string;
    }[];
  };
  /** Only user_facing checks, and only pass/fail — never the signal itself. */
  readonly integrityResult: {
    readonly allPassed: boolean;
    readonly userFacingChecks: readonly { readonly label: string; readonly passed: boolean }[];
  };
}

export interface ReportAsset {
  readonly kind: 'cv_bullet';
  readonly body: string;
  readonly approvedAt: string;
}

export interface CareerEvidenceReport {
  readonly targetRole: ReportTargetRole;
  readonly skills: readonly ReportSkillEntry[];
  readonly professionalAssets: readonly ReportAsset[];
  /** Literal for this slice: no model was involved anywhere in the chain. */
  readonly aiDisclosure: string;
  readonly generatedAt: string;
  /** Shown with the report so a reader knows what it is and is not. */
  readonly scopeNote: string;
}

export const NO_AI_DISCLOSURE =
  'No AI used in this evaluation/asset generation.';

export interface ReportInput {
  readonly targetRole: ReportTargetRole;
  readonly skills: readonly ReportSkillEntry[];
  readonly approvedAssets: readonly ReportAsset[];
  readonly generatedAt: string;
}

/**
 * Builds the report.
 *
 * Two rules it enforces on the way out:
 *  1. Only APPROVED assets appear. An unapproved draft is not a claim yet.
 *  2. Only claims at `practiced` or above appear. A gap or an unbacked
 *     self-report is not evidence and has no place in an evidence report.
 */
export function buildCareerEvidenceReport(input: ReportInput): CareerEvidenceReport {
  for (const s of input.skills) {
    if (evidenceOrdinal(s.evidenceState) < evidenceOrdinal('practiced')) {
      throw new InvariantViolation(
        'INV-1',
        `a Career Evidence Report may not list a skill at '${s.evidenceState}': it shows what evidence supports`,
        { skill: s.skillLabel, state: s.evidenceState },
      );
    }
  }

  for (const a of input.approvedAssets) {
    if (!a.approvedAt) {
      throw new InvariantViolation(
        'INV-1', 'an unapproved asset may not appear in a report', { kind: a.kind },
      );
    }
  }

  const report: CareerEvidenceReport = {
    targetRole: input.targetRole,
    skills: input.skills,
    professionalAssets: input.approvedAssets,
    aiDisclosure: NO_AI_DISCLOSURE,
    generatedAt: input.generatedAt,
    scopeNote:
      'This report shows what evidence supports. Skills marked Practiced are ' +
      'work in progress, not proven claims.',
  };

  assertReportLeaksNothing(report);
  return report;
}

/** Walks the produced object and refuses any forbidden key at any depth. */
export function assertReportLeaksNothing(report: unknown): void {
  const seen = new Set<unknown>();
  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (REPORT_FORBIDDEN_KEYS.includes(key)) {
        throw new InvariantViolation(
          'INV-6',
          `the report contains '${key}' at ${path}.${key}, which never leaves the account`,
          { key, path },
        );
      }
      walk(value, `${path}.${key}`);
    }
  };
  walk(report, '$');
}

/**
 * The public/shared projection: strictly narrower than the private report.
 *
 * Evaluation detail, integrity results and state reasons are private. A
 * recruiter with a link sees what was proven, not how the machine decided.
 */
export interface PublicEvidenceReport {
  readonly targetRole: string;
  readonly skills: readonly {
    readonly skillLabel: string;
    readonly evidenceState: EvidenceState;
    readonly projectTitle: string;
  }[];
  readonly professionalAssets: readonly { readonly body: string }[];
  readonly aiDisclosure: string;
  readonly generatedAt: string;
}

export function toPublicReport(report: CareerEvidenceReport): PublicEvidenceReport {
  const pub: PublicEvidenceReport = {
    targetRole: report.targetRole.label,
    skills: report.skills
      // Only proven claims are shown publicly. Practiced is work in progress
      // and would read as a claim to a recruiter.
      .filter((s) => evidenceOrdinal(s.evidenceState) >= evidenceOrdinal('demonstrated'))
      .map((s) => ({
        skillLabel: s.skillLabel,
        evidenceState: s.evidenceState,
        projectTitle: s.source.projectTitle,
      })),
    professionalAssets: report.professionalAssets.map((a) => ({ body: a.body })),
    aiDisclosure: report.aiDisclosure,
    generatedAt: report.generatedAt,
  };
  assertReportLeaksNothing(pub);
  return pub;
}
