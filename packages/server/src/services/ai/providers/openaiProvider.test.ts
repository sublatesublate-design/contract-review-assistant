import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { OpenAIProvider } from './openaiProvider';

function setup(t: TestContext, model: string, responses: unknown[]) {
    const logs: unknown[][] = [];
    const requests: Record<string, unknown>[] = [];
    t.mock.method(console, 'log', (...args: unknown[]) => { logs.push(args); });
    const provider = new OpenAIProvider('sk-test-private', model, 'https://example.invalid/v1');
    const client = (provider as unknown as {
        client: { chat: { completions: { create: (request: Record<string, unknown>) => Promise<unknown> } } };
    }).client;
    t.mock.method(client.chat.completions, 'create', async (request: Record<string, unknown>) => {
        requests.push(request);
        assert.ok(responses.length > 0);
        return responses.shift();
    });
    return { provider, logs, requests };
}

async function* stream(chunks: unknown[]) {
    yield* chunks;
}

function stats(logs: unknown[][], event: string) {
    return logs.filter(([label]) => String(label).endsWith(event))
        .map(([, value]) => value as Record<string, unknown>);
}

test('MiMo models use a larger documented completion budget for non-streaming calls', async (t) => {
    const models = ['mimo-v2.6-flash', 'mimo-v2.6-pro', 'mimo-v2.6-pro-ultraspeed', 'mimo-v2.5-pro', 'mimo-v2.5'];
    for (const model of models) {
        const { provider, requests } = setup(t, model, [{ choices: [{ message: { content: 'ok' } }] }]);
        assert.equal(await provider.chat([{ role: 'user', content: 'private document' }]), 'ok');
        assert.equal(requests[0]?.['max_completion_tokens'], 65536);
        assert.equal('max_tokens' in requests[0]!, false);
    }
});

test('other models get a higher budget within known older model limits', async (t) => {
    for (const [model, limit, field] of [
        ['gpt-4o', 16384, 'max_tokens'],
        ['gpt-4o-2024-05-13', 4096, 'max_tokens'],
        ['gpt-4.1', 32768, 'max_tokens'],
        ['gpt-4-turbo', 4096, 'max_tokens'],
        ['gpt-3.5-turbo', 4096, 'max_tokens'],
        ['gpt-3.5-turbo-0125', 4096, 'max_tokens'],
        ['gpt-5.2', 65536, 'max_completion_tokens'],
        ['gpt-6-astra', 65536, 'max_completion_tokens'],
        ['deepseek-v4-pro', 65536, 'max_tokens'],
        ['qwen3.7-plus', 65536, 'max_tokens'],
        ['kimi-k3', 65536, 'max_tokens'],
        ['glm-5.3', 65536, 'max_tokens'],
        ['o3', 65536, 'max_completion_tokens'],
        ['deepseek-reasoner', 65536, 'max_tokens'],
        ['custom-model', 65536, 'max_tokens'],
    ] as const) {
        const { provider, requests } = setup(t, model, [
            model.startsWith('qwen3.')
                ? stream([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }])
                : { choices: [{ message: { content: 'ok' } }] },
            stream([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]),
        ]);
        await provider.chat([]);
        let done = false;
        await provider.chatStream([], {
            onDelta: () => {}, onDone: () => { done = true; }, onError: (error) => assert.fail(error),
        });
        assert.equal(done, true);
        assert.equal(requests.length, 2);
        for (const request of requests) {
            assert.equal(request[field], limit);
            assert.equal(field === 'max_tokens' ? 'max_completion_tokens' in request : 'max_tokens' in request, false);
        }
    }
});

test('stream usage-only tail records real token counts independently of character counts', async (t) => {
    const { provider, requests, logs } = setup(t, 'mimo-v2.6-pro', [stream([
        { choices: [{ delta: { reasoning_content: 'private reasoning' }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'length' }] },
        { choices: [], usage: { prompt_tokens: 100, completion_tokens: 8192, total_tokens: 8292,
            completion_tokens_details: { reasoning_tokens: 8192 }, private_field: 'never log raw usage' } },
    ])]);
    let done = false;
    await provider.chatStream([], {
        onDelta: () => assert.fail('unexpected text'),
        onDone: () => { done = true; },
        onError: (error) => assert.fail(error),
    });
    assert.equal(done, true);
    assert.equal(requests[0]?.['max_completion_tokens'], 65536);
    assert.deepEqual(requests[0]?.['stream_options'], { include_usage: true });
    const result = stats(logs, '本轮流结束')[0]!;
    assert.equal(result['finishReason'], 'length');
    assert.equal(result['textChars'], 0);
    assert.equal(result['reasoningChars'], 'private reasoning'.length);
    assert.equal(result['usageAvailable'], true);
    assert.equal(result['promptTokens'], 100);
    assert.equal(result['completionTokens'], 8192);
    assert.equal(result['totalTokens'], 8292);
    assert.equal(result['reasoningTokens'], 8192);
    const logged = JSON.stringify(logs);
    for (const secret of ['private reasoning', 'sk-test-private', 'never log raw usage']) {
        assert.equal(logged.includes(secret), false);
    }
});

test('missing usage is logged as unknown, not zero or an estimate', async (t) => {
    const { provider, logs } = setup(t, 'custom-model', [stream([
        { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }], usage: null },
    ])]);
    let text = '';
    await provider.chatStream([], {
        onDelta: (delta) => { text += delta; }, onDone: () => {}, onError: (error) => assert.fail(error),
    });
    assert.equal(text, 'ok');
    const result = stats(logs, '本轮流结束')[0]!;
    assert.equal(result['usageAvailable'], false);
    for (const name of ['promptTokens', 'completionTokens', 'totalTokens', 'reasoningTokens']) {
        assert.equal(result[name], null);
    }
});

test('non-streaming logs preserve zero reasoning tokens and omit response content', async (t) => {
    const { provider, logs } = setup(t, 'mimo-v2.6-pro', [{
        choices: [{ message: { content: 'private response' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12,
            completion_tokens_details: { reasoning_tokens: 0 } },
    }]);
    assert.equal(await provider.chat([]), 'private response');
    const result = stats(logs, '调用完成')[0]!;
    assert.equal(result['usageAvailable'], true);
    assert.equal(result['reasoningTokens'], 0);
    assert.equal(result['completionTokens'], 2);
    assert.equal(JSON.stringify(logs).includes('private response'), false);
});

test('each tool round has its own usage, without carrying previous counts into a missing tail', async (t) => {
    const { provider, logs } = setup(t, 'mimo-v2.6-pro', [
        stream([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 't1', function: { name: 'lookup', arguments: '{}' } }] }, finish_reason: 'tool_calls' }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }]),
        stream([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]),
    ]);
    await provider.chatStream([], {
        onDelta: () => {}, onDone: () => {}, onError: (error) => assert.fail(error),
    }, undefined, [{ name: 'lookup', description: 'test', inputSchema: {} }], async () => ({ content: 'ok' }));
    const rounds = stats(logs, '本轮流结束');
    assert.equal(rounds.length, 2);
    assert.equal(rounds[0]?.['completionTokens'], 5);
    assert.equal(rounds[1]?.['usageAvailable'], false);
    assert.equal(rounds[1]?.['completionTokens'], null);
});
