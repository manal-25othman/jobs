/**
 * Phase 1 — Evidence System. These tests fix the invariants; every value
 * (types, match rules, keys) comes in as data.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertEvidenceItemTransition, assertEvidenceItemShape, classifyUrlEvidenceType, classifyActivityEvidenceType,
  classifyFileEvidenceType, assignFileArtifactKeys, nextAttemptNumber, claimEffectOfEvidenceItem, evidenceTypeFromRow,
  evidenceTypeIsValidated, userMayCreateType, findEvidenceType,
  DomainError, IllegalTransition, MissingPrerequisite, type EvidenceTypeSpec,
} from './index.js';

const T = (over: Partial<EvidenceTypeSpec> & { code: string; channel: EvidenceTypeSpec['channel'] }): EvidenceTypeSpec =>
  ({ requiredFields: [], matchRule: {}, enabled: true, reviewStatus: 'draft', ...over });

const REGISTRY: EvidenceTypeSpec[] = [
  T({ code: 'github_repository', channel: 'url', matchRule: { urlHostSuffixes: ['github.com'], urlPathPattern: '^/[^/]+/[^/]+/?$' } }),
  T({ code: 'github_commit_diff', channel: 'url', matchRule: { urlHostSuffixes: ['github.com'], urlPathPattern: '/(commit|compare|pull)/' } }),
  T({ code: 'live_demo_url', channel: 'url' }),
  T({ code: 'external_url', channel: 'url', matchRule: { urlFallback: true } }),
  T({ code: 'screenshot', channel: 'file', matchRule: { contentTypePrefix: 'image/' } }),
  T({ code: 'file_upload', channel: 'file', matchRule: { fileFallback: true } }),
  T({ code: 'code_submission', channel: 'activity', requiredFields: ['submission_id'], matchRule: { activityFallback: true } }),
  T({ code: 'bug_fix', channel: 'activity', requiredFields: ['submission_id'], matchRule: { activityKind: 'debug_improve' } }),
  T({ code: 'text_explanation', channel: 'text' }),
  T({ code: 'automated_check_result', channel: 'system', requiredFields: ['evaluation_result_id'] }),
  T({ code: 'previous_attempt', channel: 'system', requiredFields: ['previous_item_id'] }),
];

describe('evidence item lifecycle — forward-only', () => {
  test('draft → submitted → withdrawn | superseded', () => {
    assert.doesNotThrow(() => assertEvidenceItemTransition('draft', 'submitted'));
    assert.doesNotThrow(() => assertEvidenceItemTransition('submitted', 'withdrawn'));
    assert.doesNotThrow(() => assertEvidenceItemTransition('submitted', 'superseded'));
  });
  test('NEGATIVE: no way back, no edit in place, terminal stays terminal', () => {
    assert.throws(() => assertEvidenceItemTransition('submitted', 'draft'), IllegalTransition);
    assert.throws(() => assertEvidenceItemTransition('submitted', 'submitted'), IllegalTransition);
    assert.throws(() => assertEvidenceItemTransition('withdrawn', 'submitted'), IllegalTransition);
    assert.throws(() => assertEvidenceItemTransition('superseded', 'withdrawn'), IllegalTransition);
  });
});

describe('evidence item shape — decided by the registry row, not by code', () => {
  test('each channel demands its field', () => {
    assert.throws(() => assertEvidenceItemShape(findEvidenceType(REGISTRY, 'live_demo_url'), { typeCode: 'live_demo_url', source: 'user_direct', title: 'demo' }), MissingPrerequisite);
    assert.throws(() => assertEvidenceItemShape(findEvidenceType(REGISTRY, 'live_demo_url'), { typeCode: 'live_demo_url', source: 'user_direct', title: 'demo', url: 'ftp://x' }), DomainError);
    assert.throws(() => assertEvidenceItemShape(findEvidenceType(REGISTRY, 'file_upload'), { typeCode: 'file_upload', source: 'user_direct', title: 'f' }), MissingPrerequisite);
    assert.throws(() => assertEvidenceItemShape(findEvidenceType(REGISTRY, 'text_explanation'), { typeCode: 'text_explanation', source: 'user_direct', title: 'n', description: '  ' }), MissingPrerequisite);
    assert.throws(() => assertEvidenceItemShape(findEvidenceType(REGISTRY, 'code_submission'), { typeCode: 'code_submission', source: 'user_submission', title: 's' }), MissingPrerequisite);
    assert.doesNotThrow(() => assertEvidenceItemShape(findEvidenceType(REGISTRY, 'live_demo_url'), { typeCode: 'live_demo_url', source: 'user_direct', title: 'demo', url: 'https://demo.example' }));
    assert.doesNotThrow(() => assertEvidenceItemShape(findEvidenceType(REGISTRY, 'code_submission'), { typeCode: 'code_submission', source: 'user_submission', title: 's', submissionId: 'sub-1' }));
  });
  test('NEGATIVE: a system type cannot be user-created; a disabled type is refused; required metadata is named', () => {
    assert.throws(() => assertEvidenceItemShape(findEvidenceType(REGISTRY, 'automated_check_result'), { typeCode: 'automated_check_result', source: 'user_direct', title: 'x', evaluationResultId: 'r' }), /system-created only/);
    assert.throws(() => assertEvidenceItemShape(findEvidenceType(REGISTRY, 'automated_check_result'), { typeCode: 'automated_check_result', source: 'system', title: 'x' }), /requires field 'evaluation_result_id'/);
    assert.throws(() => assertEvidenceItemShape(findEvidenceType(REGISTRY, 'previous_attempt'), { typeCode: 'previous_attempt', source: 'system', title: 'x' }), MissingPrerequisite);
    assert.doesNotThrow(() => assertEvidenceItemShape(findEvidenceType(REGISTRY, 'previous_attempt'), { typeCode: 'previous_attempt', source: 'system', title: 'x', previousItemId: 'i1' }));
    const disabled = T({ code: 'gone', channel: 'text', enabled: false });
    assert.throws(() => assertEvidenceItemShape(disabled, { typeCode: 'gone', source: 'user_direct', title: 't', description: 'd' }), /disabled/);
    assert.throws(() => findEvidenceType(REGISTRY, 'not_registered'), MissingPrerequisite);
    assert.equal(userMayCreateType(findEvidenceType(REGISTRY, 'automated_check_result')), false);
    assert.equal(userMayCreateType(findEvidenceType(REGISTRY, 'code_submission')), false, 'a submission item comes from the submission flow');
    assert.equal(userMayCreateType(findEvidenceType(REGISTRY, 'live_demo_url')), true);
  });
});

describe('classification is data-driven', () => {
  test('url: specific host+path, then host, then the declared fallback', () => {
    assert.equal(classifyUrlEvidenceType(REGISTRY, 'https://github.com/manal/app').code, 'github_repository');
    assert.equal(classifyUrlEvidenceType(REGISTRY, 'https://github.com/manal/app/commit/abc123').code, 'github_commit_diff');
    assert.equal(classifyUrlEvidenceType(REGISTRY, 'https://github.com/manal/app/pull/4').code, 'github_commit_diff');
    assert.equal(classifyUrlEvidenceType(REGISTRY, 'https://example.com/repo').code, 'external_url');
    assert.equal(classifyUrlEvidenceType(REGISTRY, 'https://github.com/manal/app/tree/main/src').code, 'external_url', 'a deeper github path is neither a repo root nor a diff');
  });
  test('NEGATIVE: no fallback row ⇒ a named error, never a guessed type', () => {
    const noFallback = REGISTRY.filter((t) => t.code !== 'external_url');
    assert.throws(() => classifyUrlEvidenceType(noFallback, 'https://example.com/x'), MissingPrerequisite);
    assert.throws(() => classifyActivityEvidenceType(REGISTRY.filter((t) => t.code !== 'code_submission'), null), MissingPrerequisite);
    assert.throws(() => classifyFileEvidenceType(REGISTRY.filter((t) => t.code !== 'file_upload'), 'text/plain'), MissingPrerequisite);
  });
  test('activity kind and file content type map through the registry', () => {
    assert.equal(classifyActivityEvidenceType(REGISTRY, 'debug_improve').code, 'bug_fix');
    assert.equal(classifyActivityEvidenceType(REGISTRY, 'unknown_kind').code, 'code_submission');
    assert.equal(classifyActivityEvidenceType(REGISTRY, null).code, 'code_submission');
    assert.equal(classifyFileEvidenceType(REGISTRY, 'image/png').code, 'screenshot');
    assert.equal(classifyFileEvidenceType(REGISTRY, 'text/javascript').code, 'file_upload');
    assert.equal(classifyFileEvidenceType(REGISTRY, null).code, 'file_upload');
  });
});

describe('artifact keys come from the activity deliverables (legacy convention only as a named fallback)', () => {
  const declared = [
    { key: 'file.index_html', format: 'source file', mandatory: true, position: 0 },
    { key: 'note.data_flow', format: 'text', mandatory: true, position: 3 },
    { key: 'file.styles_css', format: 'source file', mandatory: true, position: 1 },
    { key: 'file.app_js', format: 'source file', mandatory: true, position: 2 },
  ];
  test('declared file deliverables, by position, regardless of input order', () => {
    assert.deepEqual(assignFileArtifactKeys(declared, 3), [
      { key: 'file.index_html', resolvedFrom: 'activity_deliverable' },
      { key: 'file.styles_css', resolvedFrom: 'activity_deliverable' },
      { key: 'file.app_js', resolvedFrom: 'activity_deliverable' },
    ]);
  });
  test('a submission that states file facts explicitly owns the declared keys: its uploads keep the legacy keys (no gate is satisfied by accident)', () => {
    assert.deepEqual(assignFileArtifactKeys(declared, 2, ['file.index_html', 'file.styles_css', 'file.app_js']), [
      { key: 'file.component', resolvedFrom: 'legacy_convention' },
      { key: 'file.test', resolvedFrom: 'legacy_convention' },
    ]);
    // Even one explicit file fact switches the whole submission to the legacy keys: a missing fact stays missing.
    assert.deepEqual(assignFileArtifactKeys(declared, 2, ['file.index_html', 'file.app_js']).map((k) => k.key), ['file.component', 'file.test']);
    // Non-file facts (test.*, note.*) do not interfere.
    assert.deepEqual(assignFileArtifactKeys(declared, 2, ['test.empty_state', 'note.data_flow']).map((k) => k.key), ['file.index_html', 'file.styles_css']);
  });
  test('backward compatibility: the demo convention is reproduced exactly when nothing is declared', () => {
    assert.deepEqual(assignFileArtifactKeys([], 3), [
      { key: 'file.component', resolvedFrom: 'legacy_convention' },
      { key: 'file.test', resolvedFrom: 'legacy_convention' },
      { key: 'file.extra_2', resolvedFrom: 'legacy_convention' },
    ]);
    // The seeded demo activity declares file.component / file.test at 0 / 1: same keys either way.
    const demo = [{ key: 'file.component', format: 'source file', mandatory: true, position: 0 }, { key: 'file.test', format: 'source file', mandatory: true, position: 1 }];
    assert.deepEqual(assignFileArtifactKeys(demo, 3).map((k) => k.key), ['file.component', 'file.test', 'file.extra_2']);
    assert.deepEqual(assignFileArtifactKeys(demo, 1, ['file.component']).map((k) => k.key), ['file.test']);
  });
  test('NEGATIVE: a bad count is refused', () => {
    assert.throws(() => assignFileArtifactKeys(declared, -1), DomainError);
    assert.throws(() => assignFileArtifactKeys(declared, 1.5), DomainError);
  });
});

describe('attempts, claim effect, registry rows', () => {
  test('attempt numbering is a count, not a permission', () => {
    assert.equal(nextAttemptNumber(0), 1);
    assert.equal(nextAttemptNumber(3), 4);
    assert.throws(() => nextAttemptNumber(-1), DomainError);
  });
  test('INV-1 for the ledger: an item has no effect on a claim', () => {
    assert.equal(claimEffectOfEvidenceItem(), 'none');
  });
  test('registry rows map to specs; seeded rows are DRAFT, not validated', () => {
    const spec = evidenceTypeFromRow({ code: 'github_repository', channel: 'url', required_fields: [], match_rule: { url_host_suffixes: ['github.com'], url_path_pattern: '^/[^/]+/[^/]+/?$' }, enabled: true, review_status: 'draft' });
    assert.deepEqual(spec.matchRule.urlHostSuffixes, ['github.com']);
    assert.equal(evidenceTypeIsValidated(spec), false);
    assert.equal(evidenceTypeIsValidated({ ...spec, reviewStatus: 'approved' }), true);
    assert.throws(() => evidenceTypeFromRow({ code: 'x', channel: 'telepathy', required_fields: [], match_rule: {}, enabled: true, review_status: 'draft' }), DomainError);
  });
});
