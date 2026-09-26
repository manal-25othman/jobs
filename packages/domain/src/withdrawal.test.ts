import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { effectOfWithdrawal, assertRelinkAllowed, assertAssetTransition, reestablishmentAllowed, DomainError, MissingPrerequisite } from './index.js';

describe('D-077 — withdrawn evidence', () => {
  test('withdrawal moves the asset to needs_review, removes evidence-backed status, keeps history, explains non-punitively', () => {
    const e = effectOfWithdrawal({ assetId: 'a', evidenceId: 'ev', reason: 'submission was not my own work' });
    assert.equal(e.to, 'needs_review'); assert.equal(e.evidenceBacked, false);
    assert.match(e.explanationAr, /محفوظ/); assert.ok(!/خطأ|عقوب|غش/.test(e.explanationAr));
    assert.throws(() => effectOfWithdrawal({ assetId: 'a', evidenceId: 'ev', reason: ' ' }), MissingPrerequisite);
  });
  test('lifecycle: active → needs_review → active (re-link) or retired; never a silent delete', () => {
    assert.doesNotThrow(() => assertAssetTransition('active', 'needs_review', { userApprovedAt: 'x' }));
    assert.doesNotThrow(() => assertAssetTransition('needs_review', 'active', { userApprovedAt: 'x' }));
    assert.throws(() => assertAssetTransition('needs_review', 'active', { userApprovedAt: null }), MissingPrerequisite);
  });
  test('re-link only to independent qualifying evidence: same owner, same skill, not withdrawn, demonstrated+', () => {
    const asset = { skillId: 's1', ownerId: 'u1' };
    assert.doesNotThrow(() => assertRelinkAllowed(asset, { evidenceId: 'e', skillId: 's1', state: 'demonstrated', withdrawn: false, ownerId: 'u1' }));
    assert.throws(() => assertRelinkAllowed(asset, { evidenceId: 'e', skillId: 's2', state: 'demonstrated', withdrawn: false, ownerId: 'u1' }), DomainError);
    assert.throws(() => assertRelinkAllowed(asset, { evidenceId: 'e', skillId: 's1', state: 'practiced', withdrawn: false, ownerId: 'u1' }), DomainError);
    assert.throws(() => assertRelinkAllowed(asset, { evidenceId: 'e', skillId: 's1', state: 'demonstrated', withdrawn: true, ownerId: 'u1' }), DomainError);
    assert.throws(() => assertRelinkAllowed(asset, { evidenceId: 'e', skillId: 's1', state: 'demonstrated', withdrawn: false, ownerId: 'u2' }), DomainError);
  });
  test('re-establishment: only when the primary evidence no longer stands and the new result earns at least the current state', () => {
    assert.equal(reestablishmentAllowed({ currentState: 'demonstrated', proposedState: 'demonstrated', primaryEvidenceStanding: false }), true);
    assert.equal(reestablishmentAllowed({ currentState: 'demonstrated', proposedState: 'demonstrated', primaryEvidenceStanding: true }), false, 'standing evidence: the normal ladder applies');
    assert.equal(reestablishmentAllowed({ currentState: 'demonstrated', proposedState: null, primaryEvidenceStanding: false }), false);
    assert.equal(reestablishmentAllowed({ currentState: 'demonstrated', proposedState: 'practiced', primaryEvidenceStanding: false }), false, 'a weaker result re-establishes nothing');
    assert.equal(reestablishmentAllowed({ currentState: 'practiced', proposedState: 'demonstrated', primaryEvidenceStanding: false }), false, 'below demonstrated there is no evidence to re-establish; the ladder promotes instead');
  });
});
