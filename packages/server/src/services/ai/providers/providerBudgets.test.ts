import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClaudeProvider } from './claudeProvider';
import { OllamaProvider } from './ollamaProvider';

async function* emptyStream() {}

test('Claude uses higher budgets in both call modes, respecting older model caps', async (t) => {
    for (const [model, limit] of [
        ['claude-sonnet-5-5', 64000],
        ['claude-opus-5-5', 64000],
        ['claude-haiku-5-5', 64000],
        ['claude-opus-4-6', 64000],
        ['claude-sonnet-4-6', 64000],
        ['claude-opus-4-5', 64000],
        ['claude-opus-4-1-20250805', 32000],
        ['claude-3-5-sonnet-20241022', 8192],
        ['claude-3-haiku-20240307', 4096],
    ] as const) {
        const provider = new ClaudeProvider('test-key', model);
        const requests: Record<string, unknown>[] = [];
        const client = (provider as unknown as {
            client: { messages: { create: (request: Record<string, unknown>) => Promise<unknown> } };
        }).client;
        t.mock.method(client.messages, 'create', async (request: Record<string, unknown>) => {
            requests.push(request);
            return request['stream'] ? emptyStream() : { content: [{ type: 'text', text: 'ok' }] };
        });
        assert.equal(await provider.chat([{ role: 'user', content: 'test' }]), 'ok');
        let done = false;
        await provider.chatStream([{ role: 'user', content: 'test' }], {
            onDelta: () => {}, onDone: () => { done = true; }, onError: (error) => assert.fail(error),
        });
        assert.equal(done, true);
        assert.equal(requests.length, 2);
        for (const request of requests) assert.equal(request['max_tokens'], limit);
    }
});

test('Ollama explicitly removes prediction limits for normal and streaming calls', async (t) => {
    const requests: Record<string, unknown>[] = [];
    t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requests.push(request);
        return request['stream']
            ? new Response('{"message":{"content":"ok"},"done":true}\n')
            : Response.json({ message: { content: 'ok' } });
    });
    const provider = new OllamaProvider('qwen2.5:32b');
    assert.equal(await provider.chat([]), 'ok');
    let text = '';
    let done = false;
    await provider.chatStream([], {
        onDelta: (delta) => { text += delta; }, onDone: () => { done = true; }, onError: (error) => assert.fail(error),
    });
    assert.equal(text, 'ok');
    assert.equal(done, true);
    assert.equal(requests.length, 2);
    for (const request of requests) assert.deepEqual(request['options'], { num_predict: -1 });
});
