import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { ThinkingConfigSchema, getThinkingCapabilities, resolveThinkingOptions, type ThinkingConfig } from './thinking';
import { createProvider } from './providerFactory';
import { OpenAIProvider } from './providers/openaiProvider';
import { ClaudeProvider } from './providers/claudeProvider';
import { modelsRouter } from '../../routes/models';

const automatic: ThinkingConfig = { mode: 'auto', effort: 'auto' };
const enabled: ThinkingConfig = { mode: 'enabled', effort: 'auto' };
const disabled: ThinkingConfig = { mode: 'disabled', effort: 'auto' };

test('default policy enables known thinking models and preserves unknown protocols', () => {
    for (const [provider, model, expected] of [
        ['openai', 'gpt-6-astra', { reasoning_effort: 'medium' }],
        ['openai', 'mimo-v2.6-pro', { thinking: { type: 'enabled' } }],
        ['claude', 'claude-sonnet-5-5', { thinking: { type: 'adaptive' } }],
        ['claude', 'claude-opus-5-5', {}],
        ['ollama', 'qwen3.5:27b', { think: true }],
        ['ollama', 'custom', {}],
        ['openai', 'unknown', {}],
    ] as const) {
        assert.deepEqual(resolveThinkingOptions(provider, model), expected);
        assert.deepEqual(resolveThinkingOptions(provider, model, automatic), expected);
    }
    assert.deepEqual(ThinkingConfigSchema.parse({}), automatic);
    assert.equal(ThinkingConfigSchema.safeParse({ mode: 'invalid' }).success, false);
    assert.equal(ThinkingConfigSchema.safeParse({ mode: 'enabled', secret: 'extra' }).success, false);
});

test('native model parameters match supported modes and effort values', () => {
    assert.deepEqual(resolveThinkingOptions('openai', 'gpt-6-astra', { mode: 'enabled', effort: 'xhigh' }), { reasoning_effort: 'xhigh' });
    assert.deepEqual(resolveThinkingOptions('openai', 'gpt-5.4', disabled), { reasoning_effort: 'none' });
    assert.deepEqual(resolveThinkingOptions('openai', 'mimo-v2.6-pro', disabled), { thinking: { type: 'disabled' } });
    assert.deepEqual(resolveThinkingOptions('openai', 'mimo-v2.6-pro', enabled), { thinking: { type: 'enabled' } });
    assert.deepEqual(resolveThinkingOptions('openai', 'deepseek-v4-pro', { mode: 'auto', effort: 'max' }), { thinking: { type: 'enabled' }, reasoning_effort: 'max' });
    assert.deepEqual(resolveThinkingOptions('openai', 'kimi-k3', { mode: 'enabled', effort: 'low' }), { reasoning_effort: 'low' });
    assert.deepEqual(resolveThinkingOptions('openai', 'glm-5.3', { mode: 'enabled', effort: 'high' }), { thinking: { type: 'enabled' }, reasoning_effort: 'high' });
    assert.deepEqual(resolveThinkingOptions('openai', 'qwen3.7-plus', { mode: 'enabled', effort: 'medium' }), { enable_thinking: true, thinking_budget: 8192 });
    assert.deepEqual(resolveThinkingOptions('openai', 'qwen3.7-plus', disabled), { enable_thinking: false });
    assert.deepEqual(resolveThinkingOptions('claude', 'claude-sonnet-5-5', { mode: 'enabled', effort: 'high' }), { thinking: { type: 'adaptive' }, output_config: { effort: 'high' } });
    assert.deepEqual(resolveThinkingOptions('claude', 'claude-opus-5-5', { mode: 'enabled', effort: 'max' }), { output_config: { effort: 'max' } });
    assert.deepEqual(resolveThinkingOptions('claude', 'claude-haiku-5-5', disabled), { thinking: { type: 'disabled' } });
    assert.deepEqual(resolveThinkingOptions('ollama', 'qwen3.5:27b', disabled), { think: false });
    assert.deepEqual(resolveThinkingOptions('ollama', 'gpt-oss:20b', { mode: 'enabled', effort: 'low' }), { think: 'low' });
});

test('unsupported requests fail clearly instead of silently ignoring the user setting', () => {
    for (const [provider, model] of [['openai', 'gpt-6-astra'], ['openai', 'kimi-k3'], ['openai', 'glm-5.3'], ['claude', 'claude-opus-5-5'], ['claude', 'claude-sonnet-5-5'], ['ollama', 'gpt-oss:20b']]) {
        assert.throws(() => resolveThinkingOptions(provider!, model!, disabled), /不支持/);
    }
    assert.throws(() => resolveThinkingOptions('openai', 'mimo-v2.6-pro', { mode: 'enabled', effort: 'high' }), /等级/);
    assert.throws(() => resolveThinkingOptions('openai', 'gpt-5.1', { mode: 'enabled', effort: 'xhigh' }), /等级/);
    assert.throws(() => resolveThinkingOptions('openai', 'deepseek-v4-pro', { mode: 'enabled', effort: 'medium' }), /等级/);
    assert.throws(() => resolveThinkingOptions('openai', 'qwen3.7-plus', { mode: 'disabled', effort: 'high' }), /关闭思考/);
    assert.throws(() => resolveThinkingOptions('openai', 'unknown', enabled), /不支持/);
    assert.deepEqual(getThinkingCapabilities('openai', 'unknown').modes, ['auto']);
    assert.deepEqual(getThinkingCapabilities('openai', 'mimo-v2.6-pro').efforts, ['auto']);
});

async function* stream(chunks: unknown[]) { yield* chunks; }

function mockOpenAI(t: TestContext, provider: OpenAIProvider, responses: unknown[]) {
    const requests: Record<string, unknown>[] = [];
    t.mock.method(console, 'log', () => {});
    const client = (provider as unknown as { client: { chat: { completions: { create: (body: Record<string, unknown>) => Promise<unknown> } } } }).client;
    t.mock.method(client.chat.completions, 'create', async (body: Record<string, unknown>) => {
        requests.push(structuredClone(body));
        assert.ok(responses.length > 0);
        return responses.shift();
    });
    return requests;
}

test('factory and both OpenAI call paths send selected thinking options', async (t) => {
    const provider = createProvider({ provider: 'openai', model: 'mimo-v2.6-pro', apiKey: 'fake', thinking: disabled }) as OpenAIProvider;
    const requests = mockOpenAI(t, provider, [
        { choices: [{ message: { content: 'ok' } }] },
        stream([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]),
    ]);
    assert.equal(await provider.chat([]), 'ok');
    await provider.chatStream([], { onDelta() {}, onDone() {}, onError: (error) => assert.fail(error) });
    assert.equal(requests.length, 2);
    for (const request of requests) assert.deepEqual(request['thinking'], { type: 'disabled' });
});

test('Qwen thinking chat collects streaming text for non-streaming consumers', async (t) => {
    const provider = new OpenAIProvider('fake', 'qwen3.7-plus', undefined, { mode: 'enabled', effort: 'low' });
    const requests = mockOpenAI(t, provider, [stream([
        { choices: [{ delta: { reasoning_content: 'private thinking' } }] },
        { choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] },
    ])]);
    assert.equal(await provider.chat([]), 'answer');
    assert.equal(requests[0]?.['stream'], true);
    assert.equal(requests[0]?.['enable_thinking'], true);
    assert.equal(requests[0]?.['thinking_budget'], 2048);
});

test('thinking content survives a tool round without leaking into visible text', async (t) => {
    const provider = new OpenAIProvider('fake', 'deepseek-v4-pro', undefined, enabled);
    const requests = mockOpenAI(t, provider, [
        stream([{ choices: [{ delta: { content: 'before', reasoning_content: 'private thinking', tool_calls: [{ index: 0, id: 't1', function: { name: 'lookup', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }]),
        stream([{ choices: [{ delta: { content: 'after' }, finish_reason: 'stop' }] }]),
    ]);
    let text = '';
    await provider.chatStream([], { onDelta: (delta) => { text += delta; }, onDone() {}, onError: (error) => assert.fail(error) }, undefined,
        [{ name: 'lookup', description: 'test', inputSchema: {} }], async () => ({ content: 'result' }));
    assert.equal(text, 'beforeafter');
    const messages = requests[1]?.['messages'] as Record<string, unknown>[];
    assert.equal(messages[0]?.['reasoning_content'], 'private thinking');
    assert.equal(messages[0]?.['content'], 'before');
});

test('Claude returns text after thinking blocks and preserves signed thinking during tools', async (t) => {
    const provider = new ClaudeProvider('fake', 'claude-sonnet-5-5', { mode: 'enabled', effort: 'high' });
    const requests: Record<string, unknown>[] = [];
    const client = (provider as unknown as { client: { messages: { create: (body: Record<string, unknown>) => Promise<unknown> } } }).client;
    const replies = [
        { content: [{ type: 'thinking', thinking: 'private', signature: 'sig' }, { type: 'text', text: 'answer' }] },
        stream([
            { type: 'content_block_start', content_block: { type: 'thinking', thinking: '', signature: '' } },
            { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'private' } },
            { type: 'content_block_delta', delta: { type: 'signature_delta', signature: 'sig' } },
            { type: 'content_block_stop' },
            { type: 'content_block_start', content_block: { type: 'tool_use', id: 't1', name: 'lookup', input: {} } },
            { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"q":1}' } },
            { type: 'content_block_stop' },
        ]),
        stream([{ type: 'content_block_start', content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'after' } }, { type: 'content_block_stop' }]),
    ];
    t.mock.method(console, 'log', () => {});
    t.mock.method(client.messages, 'create', async (body: Record<string, unknown>) => { requests.push(structuredClone(body)); return replies.shift(); });
    assert.equal(await provider.chat([]), 'answer');
    let text = '';
    await provider.chatStream([], { onDelta: (delta) => { text += delta; }, onDone() {}, onError: (error) => assert.fail(error) }, undefined,
        [{ name: 'lookup', description: 'test', inputSchema: {} }], async () => ({ content: 'result' }));
    assert.equal(text, 'after');
    for (const request of requests) {
        assert.deepEqual(request['thinking'], { type: 'adaptive' });
        assert.deepEqual(request['output_config'], { effort: 'high' });
    }
    const messages = requests[2]?.['messages'] as { content: Record<string, unknown>[] }[];
    assert.deepEqual(messages[0]?.content[0], { type: 'thinking', thinking: 'private', signature: 'sig' });
    assert.deepEqual(messages[0]?.content[1]?.['input'], { q: 1 });
});

test('Ollama sends think in both call modes through the factory', async (t) => {
    const bodies: Record<string, unknown>[] = [];
    t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        bodies.push(body);
        return body['stream'] ? new Response('{"message":{"content":"ok"},"done":true}\n') : Response.json({ message: { content: 'ok' } });
    });
    const provider = createProvider({ provider: 'ollama', model: 'qwen3.5:27b', thinking: disabled });
    assert.equal(await provider.chat([]), 'ok');
    await provider.chatStream([], { onDelta() {}, onDone() {}, onError: (error) => assert.fail(error) });
    assert.equal(bodies.length, 2);
    for (const body of bodies) assert.equal(body['think'], false);
});

test('capability route validates input and returns no secrets', async () => {
    const layer = modelsRouter.stack.find((item) => item.route?.path === '/thinking');
    assert.ok(layer?.route?.stack[0]);
    const handler = layer.route.stack[0].handle as unknown as (request: unknown, response: unknown) => void;
    let status = 200;
    let body: unknown;
    const response = { status(value: number) { status = value; return this; }, json(value: unknown) { body = value; } };
    handler({ query: { provider: 'openai', model: 'mimo-v2.6-pro' } }, response);
    assert.equal(status, 200);
    assert.deepEqual(body, getThinkingCapabilities('openai', 'mimo-v2.6-pro'));
    handler({ query: { provider: 'invalid', model: 'mimo-v2.6-pro' } }, response);
    assert.equal(status, 400);
});

test('mainstream provider profiles send their own parameters and preserve default reasoning', () => {
    for (const [model, expected] of [
        ['gpt-6-sol', { reasoning_effort: 'medium' }],
        ['gemini-3.7-flash', { reasoning_effort: 'medium' }],
        ['gemini-3-pro-preview', { reasoning_effort: 'high' }],
        ['gemini-2.5-flash', { reasoning_effort: 'medium' }],
        ['grok-4.6', { reasoning_effort: 'high' }],
        ['grok-4-fast-reasoning', {}],
        ['MiniMax-M3', { thinking: { type: 'adaptive' }, reasoning_split: true }],
        ['MiniMax-M2.5', { reasoning_split: true }],
        ['MiniMax-M3.1-Flash-Preview', { thinking: { type: 'adaptive' }, reasoning_split: true }],
        ['doubao-seed-2-1-pro-260628', { thinking: { type: 'enabled' } }],
        ['step-3.5-flash-2603', {}],
        ['deepseek-v4.1-flash', { thinking: { type: 'enabled' } }],
        ['qwen3.7-plus', { enable_thinking: true }],
        ['kimi-k2.6', { thinking: { type: 'enabled' } }],
        ['hunyuan-2.0-thinking', {}],
    ] as const) {
        assert.deepEqual(resolveThinkingOptions('openai', model), expected, model);
        assert.ok(getThinkingCapabilities('openai', model).modes.includes('enabled'), model);
    }
});

test('only specifically verified mixed models accept disabling; low is not off', () => {
    for (const model of ['gemini-3.7-flash', 'gemini-2.5-pro', 'grok-4.6', 'MiniMax-M2.5', 'MiniMax-M3.1-Flash-Preview', 'step-3.5-flash-2603', 'hunyuan-2.0-thinking', 'kimi-k3', 'glm-5.3']) {
        assert.equal(getThinkingCapabilities('openai', model).modes.includes('disabled'), false, model);
        assert.throws(() => resolveThinkingOptions('openai', model, disabled), /不支持/, model);
    }
    assert.deepEqual(resolveThinkingOptions('openai', 'gemini-2.5-flash', disabled), { reasoning_effort: 'none' });
    assert.deepEqual(resolveThinkingOptions('openai', 'gpt-6-sol', disabled), { reasoning_effort: 'none' });
    assert.deepEqual(resolveThinkingOptions('openai', 'MiniMax-M3', disabled), { thinking: { type: 'disabled' }, reasoning_split: true });
    assert.deepEqual(resolveThinkingOptions('openai', 'doubao-seed-2-1-pro-260628', disabled), { thinking: { type: 'disabled' }, reasoning_effort: 'minimal' });
    assert.deepEqual(resolveThinkingOptions('openai', 'grok-4.6', { mode: 'auto', effort: 'low' }), { reasoning_effort: 'low' });
    assert.throws(() => resolveThinkingOptions('openai', 'grok-4.5', { mode: 'auto', effort: 'xhigh' }), /等级/);
    assert.throws(() => resolveThinkingOptions('openai', 'gemini-3-pro-preview', { mode: 'auto', effort: 'medium' }), /等级/);
    assert.deepEqual(resolveThinkingOptions('openai', 'MiniMax-M3.1-Flash-Preview', { mode: 'auto', effort: 'max' }), { thinking: { type: 'adaptive' }, reasoning_split: true, reasoning_effort: 'max' });
    assert.throws(() => resolveThinkingOptions('openai', 'MiniMax-M3', { mode: 'auto', effort: 'high' }), /等级/);
});

test('unverified model variants and deployment aliases do not inherit family capabilities', () => {
    for (const model of ['ep-123', 'ernie-5.0', 'hunyuan-2.0-instruct', 'gpt-6-astra-custom', 'MiniMax-M3-custom', 'qwen3.7-max-preview', 'gemini-3.7-custom', 'grok-4.6-non-reasoning']) {
        assert.deepEqual(getThinkingCapabilities('openai', model).modes, ['auto'], model);
        assert.deepEqual(resolveThinkingOptions('openai', model), {}, model);
        assert.throws(() => resolveThinkingOptions('openai', model, disabled), /不支持/, model);
    }
});

test('factory default policy really sends thinking switches to both API call paths', async (t) => {
    const provider = createProvider({ provider: 'openai', model: 'mimo-v2.6-pro', apiKey: 'fake' }) as OpenAIProvider;
    const requests = mockOpenAI(t, provider, [
        { choices: [{ message: { content: 'ok' } }] },
        stream([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]),
    ]);
    assert.equal(await provider.chat([]), 'ok');
    await provider.chatStream([], { onDelta() {}, onDone() {}, onError: (error) => assert.fail(error) });
    for (const request of requests) assert.deepEqual(request['thinking'], { type: 'enabled' });
});

test('manual token budgets require a supported model and cannot conflict with effort', () => {
    assert.deepEqual(getThinkingCapabilities('openai', 'qwen3.7-plus').budgetTokens, { min: 1, max: 32768 });
    assert.equal(getThinkingCapabilities('openai', 'gpt-6-astra').budgetTokens, undefined);
    for (const budgetTokens of [1, 12345, 32768]) {
        assert.deepEqual(resolveThinkingOptions('openai', 'qwen3.7-plus', { mode: 'enabled', effort: 'auto', budgetTokens }), { enable_thinking: true, thinking_budget: budgetTokens });
    }
    for (const budgetTokens of [0, -1, 1.5, 32769, Number.NaN, Infinity]) {
        assert.equal(ThinkingConfigSchema.safeParse({ mode: 'enabled', effort: 'auto', budgetTokens }).success, false);
    }
    assert.throws(() => resolveThinkingOptions('openai', 'mimo-v2.6-pro', { mode: 'enabled', effort: 'auto', budgetTokens: 12345 }), /不支持手动/);
    assert.throws(() => resolveThinkingOptions('openai', 'qwen3.7-plus', { mode: 'disabled', effort: 'auto', budgetTokens: 12345 }), /关闭思考/);
    assert.throws(() => resolveThinkingOptions('openai', 'qwen3.7-plus', { mode: 'enabled', effort: 'high', budgetTokens: 12345 }), /不能同时/);
});

test('manual budget reaches the SDK unchanged in chat and stream requests', async (t) => {
    const provider = createProvider({ provider: 'openai', model: 'qwen3.7-plus', apiKey: 'fake', thinking: { mode: 'enabled', effort: 'auto', budgetTokens: 12345 } }) as OpenAIProvider;
    const response = () => stream([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]);
    const requests = mockOpenAI(t, provider, [response(), response()]);
    assert.equal(await provider.chat([]), 'ok');
    await provider.chatStream([], { onDelta() {}, onDone() {}, onError: (error) => assert.fail(error) });
    assert.equal(requests.length, 2);
    for (const request of requests) {
        assert.equal(request['thinking_budget'], 12345);
        assert.equal(request['enable_thinking'], true);
        assert.equal('reasoning_effort' in request, false);
    }
});

test('frontend local grade rules stay aligned with backend validation', () => {
    const { getLocalThinkingCapabilities } = require('../../../../addin/src/constants/thinkingCapabilities.ts') as {
        getLocalThinkingCapabilities: typeof getThinkingCapabilities;
    };
    for (const [provider, models] of [
        ['claude', ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-opus-4-6', 'claude-sonnet-4-6']],
        ['openai', ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.1', 'gpt-5.4', 'o3', 'deepseek-v4-pro', 'deepseek-v4.1-flash', 'deepseek-flash', 'qwen3.7-plus', 'kimi-k3', 'glm-5.3', 'gemini-3-pro-preview', 'gemini-3.1-pro-preview', 'gemini-3.7-flash', 'gemini-2.5-pro', 'grok-4.5', 'grok-4.6', 'MiniMax-M3', 'MiniMax-M3.1-Flash-Preview', 'MiniMax-M2.5', 'doubao-seed-2-1-pro-260628', 'step-3.5-flash-2603', 'mimo-v2.6-pro', 'ernie-5.0', 'ep-123', 'unknown']],
        ['ollama', ['gpt-oss:20b', 'qwen3.5:27b', 'deepseek-r1:32b', 'unknown']],
    ] as const) {
        for (const model of models) {
            const local = getLocalThinkingCapabilities(provider, model);
            const backend = getThinkingCapabilities(provider, model);
            assert.deepEqual(local.efforts, backend.efforts, model);
            assert.deepEqual(local.budgetTokens, backend.budgetTokens, model);
            for (const effort of local.efforts) {
                assert.doesNotThrow(() => resolveThinkingOptions(provider, model, { mode: 'auto', effort }), model);
            }
        }
    }
});
