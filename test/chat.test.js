import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReply } from '../server/chat.js';

test('chat sends bounded history and optional session context without executing actions', async () => {
  let request;
  const text = await generateReply({ messages: [{ role: 'user', text: 'Help me begin' }], sessionId: 'session1' }, {
    apiKey: 'test-key',
    sessions: { get: async () => ({ goal: 'Study', status: 'active', source: 'presage' }), state: async () => ({ state: 'unknown', reason: 'No signal' }) },
    fetcher: async (_url, options) => { request = options; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Begin with one problem.' }] } }] }) }; },
  });
  assert.equal(text.text, 'Begin with one problem.');
  const body = JSON.parse(request.body);
  assert.ok(body.systemInstruction.parts[0].text.includes('Study'));
  assert.equal(body.tools, undefined);
  assert.equal(request.headers['x-goog-api-key'], 'test-key');
});

test('missing configuration and malformed history fail clearly', async () => {
  const body = { messages: [{ role: 'user', text: 'Hi' }] };
  await assert.rejects(generateReply(body, { apiKey: '' }), { status: 503 });
  await assert.rejects(generateReply({ messages: [{ role: 'system', text: 'Hi' }] }, { apiKey: 'test' }), { status: 400 });
});

test('provider failures do not leak response data', async () => {
  const body = { messages: [{ role: 'user', text: 'Hi' }] };
  await assert.rejects(generateReply(body, { apiKey: 'test', fetcher: async () => ({ ok: false, status: 429 }) }), { status: 429 });
  await assert.rejects(generateReply(body, { apiKey: 'test', fetcher: async () => ({ ok: true, json: async () => ({ candidates: [] }) }) }), { status: 502 });
});
