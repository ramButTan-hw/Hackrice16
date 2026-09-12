import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSpeech } from '../server/speech.js';
import { generateReply } from '../server/chat.js';

test('speech sends server credentials and returns playable audio', async () => {
  const result = await generateSpeech('Hello', { apiKey: 'test-key', fetcher: async (url, options) => {
    assert.ok(url.endsWith('?output_format=mp3_44100_128'));
    assert.equal(options.headers['xi-api-key'], 'test-key');
    assert.deepEqual(JSON.parse(options.body), { text: 'Hello', model_id: 'eleven_v3' });
    return { ok: true, arrayBuffer: async () => Buffer.from('audio') };
  } });
  assert.equal(result.audio, 'data:audio/mpeg;base64,YXVkaW8=');
});

test('missing credentials and provider failures return safe speech errors', async () => {
  assert.ok((await generateSpeech('Hi', { apiKey: '' })).audioError);
  for (const fetcher of [
    async () => ({ ok: false }),
    async () => { throw new Error('secret provider details'); },
    async () => ({ ok: true, arrayBuffer: async () => Buffer.alloc(0) }),
  ]) {
    const result = await generateSpeech('Hi', { apiKey: 'test-key', fetcher });
    assert.equal(result.audio, undefined);
    assert.equal(result.audioError, 'Voice is unavailable. You can still read the reply.');
  }
});

test('speech is opt-in and its failure preserves the Gemini reply', async () => {
  let calls = 0;
  const options = {
    apiKey: 'test-key',
    fetcher: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Hello' }] } }] }) }),
    speech: async text => { calls++; assert.equal(text, 'Hello'); return { audioError: 'Voice unavailable' }; },
  };
  const body = { messages: [{ role: 'user', text: 'Hi' }] };
  assert.deepEqual(await generateReply(body, options), { text: 'Hello' });
  assert.equal(calls, 0);
  assert.deepEqual(await generateReply({ ...body, speak: true }, options), { text: 'Hello', audioError: 'Voice unavailable' });
  assert.equal(calls, 1);
});
