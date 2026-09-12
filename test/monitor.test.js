import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRepository } from '../server/repository.js';
import { sessionService } from '../server/session-service.js';
import { monitoringService } from '../server/monitor.js';
import { analyzeInsight } from '../server/insights.js';

async function fixture(t, options = {}) {
  let time = 1000000;
  const repository = sqliteRepository(':memory:');
  const sessions = sessionService(repository, () => time);
  const session = await sessions.start({ goal: 'Solve a calculus problem', source: 'demo' });
  const calls = [], speechCalls = [];
  const monitor = monitoringService({ sessions, now: () => time, configured: () => true,
    matlab: { analyze: async (_s, now) => ({ provider: 'matlab', timestamp: now, ready: true, validSampleCount: 30, heartRateChangePercent: 5, breathingRateChangePercent: 3 }), close: async () => {} },
    insight: async snapshot => { calls.push(snapshot); return { decision: 'intervene', reason: 'A brief check-in may help.', message: 'Would a smaller first step help?' }; },
    speech: async text => { speechCalls.push(text); return { audio: 'data:audio/mpeg;base64,YQ==' }; },
    ...options,
  });
  t.after(async () => { await monitor.close(); repository.close(); });
  await monitor.configure(session.id, { enabled: true, voice: true });
  async function observe(seconds, quality = 1, idleSeconds = 0) {
    time = session.startedAt + seconds * 1000;
    await sessions.ingest(session.id, { source: 'demo', timestamp: time, heartRate: 72, breathingRate: 15, quality });
    await monitor.activity(session.id, { idleSeconds });
  }
  return { sessions, monitor, id: session.id, calls, speechCalls, observe, setTime: seconds => { time = session.startedAt + seconds * 1000; } };
}

test('automatic analyses combine inputs, run periodically, cap requests, and limit interventions', async t => {
  const f = await fixture(t);
  await f.observe(30); await f.monitor.tick(); assert.equal(f.calls.length, 0);
  for (const seconds of [60, 120, 180, 240, 300]) { await f.observe(seconds, 1, 48); await f.monitor.tick(); }
  assert.equal(f.calls.length, 5);
  assert.equal(f.calls[0].matlab.provider, 'matlab');
  assert.equal(f.calls[0].inactivity.idleSeconds, 48);
  assert.equal(f.calls[0].presage.heartRate, 72);
  assert.equal(f.calls[0].task, 'Solve a calculus problem');
  assert.equal(f.calls[0].samples, undefined);
  assert.ok(JSON.stringify(f.calls[0]).length < 6000);
  assert.equal(f.speechCalls.length, 3);
  await f.observe(360); await f.monitor.tick();
  await f.monitor.configure(f.id, { enabled: false });
  await f.monitor.configure(f.id, { enabled: true });
  await f.observe(420); await f.monitor.tick();
  const status = await f.monitor.status(f.id);
  assert.equal(f.calls.length, 6); assert.equal(status.calls, 6); assert.equal(status.status, 'budget_reached');
});

test('signal loss, low confidence, and missing MATLAB readiness suppress automatic calls', async t => {
  const f = await fixture(t);
  await f.observe(60, .1); await f.monitor.tick(); assert.equal(f.calls.length, 0);
  f.setTime(80); await f.monitor.tick(); assert.equal(f.calls.length, 0);
  assert.equal((await f.monitor.status(f.id)).status, 'waiting_signal');
  const g = await fixture(t, { matlab: { analyze: async (_s, now) => ({ provider: 'matlab', timestamp: now, ready: false }), close: async () => {} } });
  await g.observe(60); await g.monitor.tick(); assert.equal(g.calls.length, 0);
});

test('a sustained activity change can advance analysis but never bypass the minimum interval', async t => {
  const f = await fixture(t);
  await f.observe(60); await f.monitor.tick();
  await f.observe(100, 1, 50); await f.monitor.tick(); assert.equal(f.calls.length, 1);
  await f.observe(110, 1, 60); await f.monitor.tick(); assert.equal(f.calls.length, 2);
  assert.equal((await f.sessions.get(f.id)).interventions.length, 1);
});

for (const action of ['pause', 'end']) test(`${action} cancels late delivery and overlapping ticks do not duplicate a request`, async t => {
  let resolve, began;
  const started = new Promise(r => { began = r; });
  const f = await fixture(t, { insight: async () => { began(); return new Promise(r => { resolve = r; }); } });
  await f.observe(60);
  const request = f.monitor.tick(); await started;
  await f.monitor.tick();
  if (action === 'pause') await f.monitor.configure(f.id, { enabled: false });
  else { await f.monitor.stop(f.id); await f.sessions.end(f.id); }
  resolve({ decision: 'intervene', reason: 'test', message: 'A late suggestion' });
  await request;
  const s = await f.sessions.get(f.id);
  assert.equal(s.monitor.calls, 1); assert.equal(s.interventions.length, 0); assert.equal(f.speechCalls.length, 0);
});

test('provider failures count against budget and cannot cause rapid retries', async t => {
  let attempts = 0;
  const f = await fixture(t, { insight: async () => { attempts++; throw new Error('Provider unavailable'); } });
  await f.observe(60); await f.monitor.tick();
  await f.observe(70); await f.monitor.tick();
  assert.equal(attempts, 1); assert.equal((await f.monitor.status(f.id)).calls, 1);
});

test('no-intervention decisions are recorded without creating a suggestion or speech', async t => {
  const f = await fixture(t, { insight: async () => ({ decision: 'no_intervention', reason: 'Keep working.', message: '' }) });
  await f.observe(60); await f.monitor.tick();
  const s = await f.sessions.get(f.id);
  assert.equal(s.monitor.decisions.length, 1); assert.equal(s.monitor.decisions[0].delivered, false);
  assert.equal(s.interventions.length, 0); assert.equal(f.speechCalls.length, 0);
});

test('concurrent session writes retain both activity and analysis state', async t => {
  const f = await fixture(t);
  await Promise.all([f.monitor.activity(f.id, { idleSeconds: 7 }), f.sessions.update(f.id, s => { s.monitor.calls = 2; })]);
  const s = await f.sessions.get(f.id);
  assert.equal(s.activity.idleSeconds, 7); assert.equal(s.monitor.calls, 2);
});

test('Gemini insight requests structured, bounded output and records actual token usage', async () => {
  const result = await analyzeInsight({ matlab: { ready: true }, inactivity: { idleSeconds: 42 } }, { apiKey: 'test', fetcher: async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.maxOutputTokens, 512);
    assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 0);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.equal(options.headers['x-goog-api-key'], 'test');
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ decision: 'no_intervention', reason: 'No useful interruption.', message: '' }) }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 } }) };
  } });
  assert.equal(result.decision, 'no_intervention'); assert.equal(result.usage.totalTokens, 120);
  await assert.rejects(analyzeInsight({}, { apiKey: 'test', fetcher: async () => ({ ok: true, json: async () => ({ candidates: [] }) }) }), /incomplete/);
});
