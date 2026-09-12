import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteRepository, supabaseRepository } from '../server/repository.js';
import { sessionService } from '../server/session-service.js';
import { createApp } from '../server/app.js';

function fixture(t) {
  const repo = sqliteRepository(':memory:');
  t.after(() => repo.close());
  let time = 100000;
  const service = sessionService(repo, () => time);
  return { repo, service, advance: (ms = 2000) => time += ms, sample: (extra = {}) => ({ timestamp: time, source: 'demo', heartRate: 72, breathingRate: 14, hrv: null, quality: 1, ...extra }) };
}

test('baseline, sustained elevation, cooldown, missing signal, end and summary', async t => {
  const f = fixture(t);
  const s = await f.service.start({ goal: 'Study', source: 'demo' });
  for (let i = 0; i < 11; i++) { f.advance(); await f.service.ingest(s.id, f.sample()); }
  assert.equal((await f.service.state(s.id)).state, 'steady');
  for (let i = 0; i < 4; i++) { f.advance(); await f.service.ingest(s.id, f.sample({ heartRate: 96, breathingRate: 20 })); }
  assert.equal((await f.service.state(s.id)).shouldIntervene, true);
  await f.service.intervene(s.id, { text: 'Take a break?', provider: 'demo' });
  assert.equal((await f.service.state(s.id)).shouldIntervene, false);
  await assert.rejects(f.service.intervene(s.id, { text: 'Again', provider: 'demo' }), { status: 429 });
  f.advance(); await f.service.ingest(s.id, f.sample({ heartRate: null }));
  assert.equal((await f.service.state(s.id)).state, 'unknown');
  f.advance(30000);
  await f.service.end(s.id);
  await assert.rejects(f.service.ingest(s.id, f.sample()), { status: 409 });
  const summary = await f.service.summary(s.id);
  assert.equal(summary.sampleCount, 16);
  assert.equal(summary.validSampleCount, 15);
  assert.ok(summary.stateSeconds.unknown >= 20);
  assert.equal(Object.values(summary.stateSeconds).reduce((a, b) => a + b, 0), summary.durationSeconds);
});

test('reject invalid and mixed metrics; stale samples and breaks interrupt elevation', async t => {
  const f = fixture(t); const s = await f.service.start({ goal: 'Task' });
  f.advance(); await f.service.ingest(s.id, f.sample());
  await assert.rejects(f.service.ingest(s.id, f.sample()), { status: 400 });
  f.advance(); await assert.rejects(f.service.ingest(s.id, f.sample({ source: 'presage' })), { status: 400 });
  await assert.rejects(f.service.ingest(s.id, f.sample({ quality: 2 })), { status: 400 });
  for (let i = 0; i < 11; i++) { f.advance(); await f.service.ingest(s.id, f.sample()); }
  f.advance(); await f.service.ingest(s.id, f.sample({ onBreak: true }));
  assert.equal((await f.service.state(s.id)).state, 'break');
  f.advance(11000); assert.equal((await f.service.state(s.id)).state, 'unknown');
  f.advance(); await f.service.ingest(s.id, f.sample({ idleSeconds: 130 }));
  assert.equal((await f.service.state(s.id)).state, 'away');
});

test('SQLite persists across reopen and detects concurrent writes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'companion-'));
  let repo = sqliteRepository(join(dir, 'test.sqlite'));
  try {
    const service = sessionService(repo);
    const s = await service.start({ goal: 'Persist me' });
    repo.close(); repo = sqliteRepository(join(dir, 'test.sqlite'));
    assert.equal((await repo.get(s.id)).goal, 'Persist me');
    const changed = { ...s, revision: 1 };
    await repo.save(changed, 0);
    await assert.rejects(repo.save(changed, 0), { status: 409 });
  } finally { repo.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('HTTP session lifecycle and browser origin boundary', async t => {
  const repo = sqliteRepository(':memory:');
  const app = createApp({ repository: repo });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); repo.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal: 'API integration' }) };
  assert.equal((await fetch(base + '/sessions', { ...options, headers: { ...options.headers, Origin: 'https://untrusted.example' } })).status, 403);
  const response = await fetch(base + '/sessions', options);
  assert.equal(response.status, 201);
  const s = await response.json();
  const eventResponse = await fetch(base + '/sessions/' + s.id + '/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'metrics', data: { cardio: { pulseRate: { latest: [{ value: 72, confidence: 80, stable: true }] } } } }) });
  assert.equal(eventResponse.status, 200);
  const download = await fetch(base + '/sessions/' + s.id + '/events?download=1');
  assert.match(download.headers.get('content-disposition'), /attachment/);
  assert.equal((await download.json()).events[0].source, 'presage');
  assert.equal((await fetch(base + '/sessions/' + s.id + '/summary')).status, 200);
  assert.equal((await fetch(base + '/sessions/' + s.id + '/end', { method: 'POST' })).status, 200);
  assert.equal((await fetch(base + '/sessions/' + s.id + '/end', { method: 'POST' })).status, 409);
});

test('Supabase adapter keeps secret server-side and uses revision filter', async () => {
  const calls = [];
  const repo = supabaseRepository('https://example.supabase.co', 'sb_secret_test', async (url, options) => {
    calls.push({ url, options }); return { ok: true, json: async () => [] };
  });
  await assert.rejects(repo.save({ id: 'test', revision: 2 }, 1), { status: 409 });
  assert.ok(calls[0].url.includes('revision=eq.1'));
  assert.equal(calls[0].options.headers.apikey, 'sb_secret_test');
  assert.equal(calls[0].options.headers.Authorization, undefined);
});

test('empty session averages are null and no time is invented', async t => {
  const f = fixture(t); const s = await f.service.start({ goal: 'No camera yet' });
  f.advance(12000);
  const summary = await f.service.summary(s.id);
  assert.equal(summary.averageHeartRate, null);
  assert.equal(summary.averageHrv, null);
  assert.equal(summary.stateSeconds.unknown, 12);
  assert.equal(summary.interventionCount, 0);
});

test('a lost signal interrupts sustained elevation; low quality never establishes baseline', async t => {
  const f = fixture(t); const s = await f.service.start({ goal: 'Signal quality' });
  for (let i = 0; i < 12; i++) { f.advance(); await f.service.ingest(s.id, f.sample({ quality: 0.1 })); }
  assert.equal((await f.service.get(s.id)).baseline, null);
  for (let i = 0; i < 11; i++) { f.advance(); await f.service.ingest(s.id, f.sample()); }
  for (let i = 0; i < 3; i++) { f.advance(); await f.service.ingest(s.id, f.sample({ heartRate: 96, breathingRate: 20 })); }
  f.advance(); await f.service.ingest(s.id, f.sample({ heartRate: null }));
  f.advance(); await f.service.ingest(s.id, f.sample({ heartRate: 96, breathingRate: 20 }));
  assert.equal((await f.service.state(s.id)).shouldIntervene, false);
});
