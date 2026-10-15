import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { CLAUDE_MODELS, OPENAI_MODELS, DEFAULT_MODELS, upgradeLegacyModels } from './models';

test('new defaults are current suggestions and do not recommend old cloud models', () => {
    assert.ok(CLAUDE_MODELS.includes(DEFAULT_MODELS.claude));
    assert.ok(OPENAI_MODELS.includes(DEFAULT_MODELS.openai));
    assert.equal(DEFAULT_MODELS.ollama, 'qwen3.5:27b');
    for (const model of [...CLAUDE_MODELS, ...OPENAI_MODELS]) {
        assert.equal(/^(gpt-[45]|claude-[34]|claude-(?:opus|sonnet)-4)/.test(model), false);
    }
});

test('known old cloud defaults migrate without changing installed local models or input objects', () => {
    const old = { claude: 'claude-3-5-sonnet-20241022', openai: 'gpt-4o', ollama: 'qwen2.5:32b' };
    const updated = upgradeLegacyModels(old, 'https://api.openai.com/v1/');
    assert.equal(updated.claude, DEFAULT_MODELS.claude);
    assert.equal(updated.openai, DEFAULT_MODELS.openai);
    assert.equal(updated.ollama, old.ollama);
    assert.equal(old.openai, 'gpt-4o');
    assert.equal(upgradeLegacyModels({ claude: 'claude-3-opus-20240229' }).claude, 'claude-opus-5-5');
});

test('custom endpoints and arbitrary user model names are preserved', () => {
    const models = { claude: 'custom-claude', openai: 'gpt-4o', ollama: 'my-installed-model:latest' };
    assert.deepEqual(upgradeLegacyModels(models, 'https://proxy.example/v1'), models);
    const mimo = { ...models, openai: 'mimo-v2.6-pro' };
    assert.deepEqual(upgradeLegacyModels(mimo, 'https://api.xiaomimimo.com/v1'), mimo);
    assert.deepEqual(upgradeLegacyModels({ ...models, openai: 'custom-gpt' }), { ...models, openai: 'custom-gpt' });
});

test('missing model selections use the new defaults without dropping other providers', () => {
    assert.deepEqual(upgradeLegacyModels(undefined), DEFAULT_MODELS);
    assert.deepEqual(upgradeLegacyModels({ openai: 'mimo-v2.6-pro' }), { ...DEFAULT_MODELS, openai: 'mimo-v2.6-pro' });
});

test('frontend cloud suggestions match the backend catalog', () => {
    const source = readFileSync(resolve(__dirname, '../../../server/src/routes/models.ts'), 'utf8');
    const ids = Array.from(source.matchAll(/\{ id: '([^']+)', name: '[^']+', provider: '(claude|openai)'/g))
        .map((match) => match[1]).sort();
    assert.deepEqual(ids, [...CLAUDE_MODELS, ...OPENAI_MODELS].sort());
});
