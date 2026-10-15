import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ThinkingSettings from '../taskpane/components/SettingsPanel/ThinkingSettings';
import { getLocalThinkingCapabilities } from './thinkingCapabilities';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_THINKING, normalizeThinkingConfig, normalizeThinkingCapabilities, isThinkingConfigSupported, withThinkingMode, withThinkingEffort, withThinkingBudget } from './thinking';
import { mergePersistedSettings, useSettingsStore } from '../store/settingsStore';
import { apiClient } from '../services/apiClient';
import { isThinkingSaveBlocked } from '../taskpane/components/SettingsPanel/ThinkingSettings';

const capabilities = { modes: ['auto', 'enabled', 'disabled'] as const, efforts: ['auto', 'low', 'high'] as const, note: 'test' };
const supported = normalizeThinkingCapabilities(capabilities);

test('old and partial settings gain defaults without mutating keys, models or templates', () => {
    const current = useSettingsStore.getState().settings;
    const old = { ...current, apiKeys: { openai: 'private-key', anthropic: '' }, models: { ...current.models, openai: 'mimo-v2.6-pro' } };
    const merged = mergePersistedSettings(old, current);
    assert.deepEqual(merged.thinking, DEFAULT_THINKING);
    assert.equal(merged.apiKeys.openai, 'private-key');
    assert.equal(merged.models.openai, 'mimo-v2.6-pro');
    assert.deepEqual(merged.reviewTemplates, current.reviewTemplates);
    assert.deepEqual(normalizeThinkingConfig({ effort: 'high' }), { mode: 'auto', effort: 'high' });
    assert.deepEqual(normalizeThinkingConfig({ mode: 'enabled' }), DEFAULT_THINKING);
    assert.deepEqual(normalizeThinkingConfig({ mode: 'invalid', effort: 'invalid' }), DEFAULT_THINKING);
});

test('disabled mode clears effort and cannot retain an explicit level', () => {
    const high = { mode: 'enabled', effort: 'high' } as const;
    assert.deepEqual(withThinkingMode(high, 'disabled'), { mode: 'disabled', effort: 'auto' });
    assert.deepEqual(withThinkingEffort({ mode: 'disabled', effort: 'auto' }, 'high'), { mode: 'disabled', effort: 'auto' });
    assert.deepEqual(normalizeThinkingConfig({ mode: 'disabled', effort: 'high' }), DEFAULT_THINKING);
    assert.equal(isThinkingConfigSupported({ mode: 'disabled', effort: 'high' }, supported), false);
});

test('unknown and switch-only model capabilities reject unsupported levels', () => {
    const unknown = normalizeThinkingCapabilities({ modes: ['auto'], efforts: ['auto'], note: 'unknown' });
    assert.equal(isThinkingConfigSupported(DEFAULT_THINKING, unknown), true);
    assert.equal(isThinkingConfigSupported({ mode: 'enabled', effort: 'auto' }, unknown), false);
    const switchOnly = normalizeThinkingCapabilities({ modes: ['auto', 'enabled', 'disabled'], efforts: ['auto'] });
    assert.equal(isThinkingConfigSupported({ mode: 'enabled', effort: 'high' }, switchOnly), false);
    assert.deepEqual(normalizeThinkingCapabilities({ modes: ['bad', 'enabled', 'enabled'], efforts: ['bad', 'high'] }).modes, ['enabled']);
});

test('save requires known supported capabilities for non-default settings', () => {
    for (const status of ['idle', 'loading', 'error'] as const) {
        const report = { status, capabilities: null, error: null };
        assert.equal(isThinkingSaveBlocked(DEFAULT_THINKING, report), false);
        assert.equal(isThinkingSaveBlocked({ mode: 'enabled', effort: 'high' }, report), true);
    }
    const report = { status: 'ready', capabilities: supported, error: null } as const;
    assert.equal(isThinkingSaveBlocked({ mode: 'enabled', effort: 'high' }, report), false);
    assert.equal(isThinkingSaveBlocked({ mode: 'enabled', effort: 'max' }, report), true);
});

test('capabilities are requested from local backend with encoded model and no credentials', async (t) => {
    let requested = '';
    t.mock.method(globalThis, 'fetch', async (input: unknown) => {
        requested = String(input);
        return Response.json(capabilities);
    });
    const result = await apiClient.getThinkingCapabilities('openai', 'custom/name with space', 'https://localhost:3000/');
    const url = new URL(requested);
    assert.equal(url.pathname, '/api/models/thinking');
    assert.equal(url.searchParams.get('model'), 'custom/name with space');
    assert.equal(url.searchParams.get('provider'), 'openai');
    assert.equal(url.searchParams.size, 2);
    assert.deepEqual(result, supported);
});

test('capability HTTP errors are surfaced rather than silently accepting settings', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'unavailable' }, { status: 503 }));
    await assert.rejects(apiClient.getThinkingCapabilities('openai', 'mimo-v2.6-pro', 'https://localhost:3000'), /unavailable/);
});

test('custom budgets persist and are mutually exclusive with preset effort', () => {
    const custom = withThinkingBudget({ mode: 'enabled', effort: 'high' }, 12345);
    assert.deepEqual(custom, { mode: 'enabled', effort: 'auto', budgetTokens: 12345 });
    const saved = mergePersistedSettings({ thinking: custom }, useSettingsStore.getState().settings);
    assert.deepEqual(saved.thinking, { ...custom, mode: 'auto' });
    assert.deepEqual(withThinkingEffort(custom, 'low'), { mode: 'enabled', effort: 'low' });
    assert.deepEqual(withThinkingMode(custom, 'disabled'), { mode: 'disabled', effort: 'auto' });
    assert.deepEqual(withThinkingBudget(custom, undefined), { mode: 'enabled', effort: 'auto' });
    assert.deepEqual(normalizeThinkingConfig({ mode: 'auto', effort: 'auto', budgetTokens: 0 }), DEFAULT_THINKING);
});

test('budget validation blocks invalid, unsupported or conflicting values before save', () => {
    const caps = { ...supported, budgetTokens: { min: 1, max: 32768 } };
    const report = { status: 'ready', capabilities: caps, error: null } as const;
    for (const budgetTokens of [1, 12345, 32768]) {
        assert.equal(isThinkingSaveBlocked({ mode: 'enabled', effort: 'auto', budgetTokens }, report), false);
    }
    for (const budgetTokens of [0, -1, 32769, 1.5, Number.NaN, Infinity]) {
        assert.equal(isThinkingSaveBlocked({ mode: 'enabled', effort: 'auto', budgetTokens }, report), true);
    }
    const custom = { mode: 'auto', effort: 'auto', budgetTokens: 12345 } as const;
    assert.equal(isThinkingSaveBlocked(custom, { ...report, capabilities: supported }), true);
    assert.equal(isThinkingSaveBlocked(custom, { status: 'error', capabilities: null, error: 'offline' }), true);
    assert.equal(isThinkingSaveBlocked({ ...custom, effort: 'high' }, report), true);
    assert.equal(isThinkingSaveBlocked({ ...custom, mode: 'disabled' }, report), true);
    assert.deepEqual(normalizeThinkingCapabilities(caps).budgetTokens, { min: 1, max: 32768 });
    assert.equal(normalizeThinkingCapabilities({ ...caps, budgetTokens: { min: 1, max: 999999 } }).budgetTokens, undefined);
});

test('summary requests serialize manual budget and native effort unchanged', async (t) => {
    const sent: Record<string, unknown>[] = [];
    t.mock.method(globalThis, 'fetch', async (_input: unknown, options?: RequestInit) => {
        sent.push(JSON.parse(String(options?.body)) as Record<string, unknown>);
        return Response.json({ title: 'test', overview: 'test', fields: [], sections: [] });
    });
    const thinking = { mode: 'enabled', effort: 'auto', budgetTokens: 12345 } as const;
    await apiClient.getSummary({ provider: 'openai', model: 'qwen3.7-plus', content: 'test contract', documentType: 'contract', thinking }, 'https://localhost:3000');
    assert.deepEqual(sent[0]?.['thinking'], thinking);
    await apiClient.getSummary({ provider: 'openai', model: 'gpt-6-astra', content: 'test contract', documentType: 'contract', thinking: { mode: 'enabled', effort: 'xhigh' } }, 'https://localhost:3000');
    assert.deepEqual(sent[1]?.['thinking'], { mode: 'enabled', effort: 'xhigh' });
});

test('DeepSeek grade selection works locally without any capability network request or mode control', (t) => {
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async () => { requests++; throw new Error('Failed to fetch'); });
    const html = renderToStaticMarkup(React.createElement(ThinkingSettings, {
        value: { mode: 'auto', effort: 'high' }, provider: 'openai', model: 'deepseek-v4-pro',
        onChange() {}, onCapabilityReportChange() {}, resetNotice: null,
    }));
    assert.equal(requests, 0);
    assert.ok(html.includes('id="thinking-effort"'));
    assert.equal(html.includes('id="thinking-mode"'), false);
    assert.equal(html.includes('Failed to fetch'), false);
    assert.ok(html.includes('value="high" selected=""'));
    assert.deepEqual(getLocalThinkingCapabilities('openai', 'deepseek-v4-pro').efforts, ['auto', 'low', 'high', 'max']);
});

test('old disabled configuration cannot silently keep thinking off after mode control removal', () => {
    const current = useSettingsStore.getState().settings;
    assert.deepEqual(mergePersistedSettings({ thinking: { mode: 'disabled', effort: 'auto' } }, current).thinking, DEFAULT_THINKING);
    assert.deepEqual(normalizeThinkingConfig({ mode: 'enabled', effort: 'high' }), { mode: 'auto', effort: 'high' });
});
