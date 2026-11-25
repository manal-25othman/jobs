import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWorkspaceDraft, DRAFT_TEXT_MAX_CHARS } from './workspace-draft.js';
import { FILE_DELIVERABLE_FORMAT } from './evidence-items.js';

const ACT = {
  deliverables: [
    { key: 'file.app_js', format: FILE_DELIVERABLE_FORMAT },
    { key: 'note.decision', format: 'text' },
  ],
  skillIds: ['s-js', 's-debug'],
};
const U = '0b9f9c1e-2c55-4a3a-9b55-2c7b6f9f3e11';
const reason = (f: () => unknown) => { try { f(); return 'accepted'; } catch (e) { return ((e as Error).message.match(/^\[([a-z_]+)\]/) ?? [])[1] ?? (e as Error).message; } };

describe('workspace draft (FR-U-025): what a draft may contain', () => {
  test('a draft keyed by the activity deliverables is normalized; empty answers are "not written yet"', () => {
    const d = normalizeWorkspaceDraft({ texts: { 'note.decision': 'السبب الجذري…' }, files: { 'file.app_js': U }, skillIds: ['s-js', 's-js'], disclosure: { used_ai: 'no' } }, ACT);
    assert.deepEqual(d, { texts: { 'note.decision': 'السبب الجذري…' }, files: { 'file.app_js': U }, skillIds: ['s-js'], disclosure: { used_ai: 'no' } });
    assert.deepEqual(normalizeWorkspaceDraft({ texts: { 'note.decision': '   ' } }, ACT).texts, {});
    assert.deepEqual(normalizeWorkspaceDraft({ files: { 'file.app_js': null } }, ACT).files, {}, 'a removed file is dropped');
  });
  test('unknown deliverables, crossed kinds, unmapped skills, non-ids and oversized text are refused', () => {
    assert.equal(reason(() => normalizeWorkspaceDraft({ texts: { 'note.other': 'x' } }, ACT)), 'draft_unknown_deliverable');
    assert.equal(reason(() => normalizeWorkspaceDraft({ texts: { 'file.app_js': 'x' } }, ACT)), 'draft_unknown_deliverable');
    assert.equal(reason(() => normalizeWorkspaceDraft({ files: { 'note.decision': U } }, ACT)), 'draft_unknown_deliverable');
    assert.equal(reason(() => normalizeWorkspaceDraft({ files: { 'file.app_js': 'app.js' } }, ACT)), 'draft_malformed');
    assert.equal(reason(() => normalizeWorkspaceDraft({ skillIds: ['s-other'] }, ACT)), 'draft_skill_not_mapped');
    assert.equal(reason(() => normalizeWorkspaceDraft({ texts: { 'note.decision': 'x'.repeat(DRAFT_TEXT_MAX_CHARS + 1) } }, ACT)), 'draft_too_large');
    assert.equal(reason(() => normalizeWorkspaceDraft({ disclosure: { q: { nested: true } } }, ACT)), 'draft_malformed');
    assert.equal(reason(() => normalizeWorkspaceDraft({ texts: 'x' as unknown as Record<string, unknown> }, ACT)), 'draft_malformed');
  });
});
