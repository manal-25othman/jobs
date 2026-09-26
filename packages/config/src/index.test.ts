import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadEnv, renderEnvExample, ConfigError, ENV_SPEC } from './index.js';

const base = {
  NODE_ENV: 'development',
  NAQLA_DEPLOY_REGION: 'unset-pending-OPEN-022',
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-anon-key',
};

describe('config validation', () => {
  test('a complete api environment loads', () => {
    const env = loadEnv({
      scope: 'api',
      env: { ...base, SUPABASE_SERVICE_ROLE_KEY: 'k', DATABASE_URL: 'postgresql://x@y:5432/z' },
    });
    assert.equal(env.NODE_ENV, 'development');
  });

  test('missing required values are all reported at once, not one at a time', () => {
    try {
      loadEnv({ scope: 'api', env: { NODE_ENV: 'development' } });
      assert.fail('expected ConfigError');
    } catch (e) {
      assert.ok(e instanceof ConfigError);
      assert.ok(e.problems.length >= 4, `expected several problems, got ${e.problems.length}`);
    }
  });

  test('an invalid value is named with the reason', () => {
    try {
      loadEnv({ scope: 'web', env: { ...base, NEXT_PUBLIC_APP_URL: 'not-a-url', NEXT_PUBLIC_API_URL: 'http://x' } });
      assert.fail('expected ConfigError');
    } catch (e) {
      assert.ok(e instanceof ConfigError);
      assert.ok(e.problems.some((p) => p.includes('NEXT_PUBLIC_APP_URL') && p.includes('absolute URL')));
    }
  });

  test('a secret smuggled into a NEXT_PUBLIC_ name is refused', () => {
    try {
      loadEnv({
        scope: 'api',
        env: { ...base, SUPABASE_SERVICE_ROLE_KEY: 'k', DATABASE_URL: 'postgresql://x@y:5432/z',
               NEXT_PUBLIC_SERVICE_ROLE_KEY: 'leaked' },
      });
      assert.fail('expected ConfigError');
    } catch (e) {
      assert.ok(e instanceof ConfigError);
      assert.ok(e.problems.some((p) => p.includes('exposes a secret to the browser')));
    }
  });

  test('the deploy region is required, because data residency is a decision', () => {
    const spec = ENV_SPEC.find((v) => v.name === 'NAQLA_DEPLOY_REGION');
    assert.ok(spec);
    assert.equal(spec.required, true);
  });

  test('Phase 0 carries no model-provider credentials', () => {
    const providerish = ENV_SPEC.filter((v) => /OPENAI|ANTHROPIC|MODEL_API|LLM_KEY/i.test(v.name));
    assert.deepEqual(providerish, [], 'no AI calls exist yet and OPEN-023 is unresolved');
  });

  test('.env.example renders every variable in the spec', () => {
    const rendered = renderEnvExample();
    for (const v of ENV_SPEC) assert.ok(rendered.includes(v.name), `${v.name} missing from .env.example`);
  });
});
