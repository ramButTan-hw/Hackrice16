import test from 'node:test';
import assert from 'node:assert/strict';
import { stressPatterns, suggestSlots, plannerService } from '../server/planner.js';
import { summarize } from '../server/analytics.js';
import { sqliteRepository, supabaseRepository } from '../server/repository.js';
import { createApp } from '../server/app.js';

const stamp = Date.parse('2026-09-01T09:00:00Z');
function session(day = 0, changes = {}) {
  const start = stamp + day * 86400000;
  return { id: `session-${day}`, source: 'presage', status: 'ended', startedAt: start, endedAt: start + 300000, interventions: [],
    samples: Array.from({ length: 30 }, (_, i) => ({ timestamp: start + i * 10000, quality: 1, heartRate: 72, breathingRate: 14, hrv: null, state: i < 15 ? 'steady' : 'elevated' })), ...changes };
}
test('patterns require repeated real history and weight observed time', () => {
  assert.equal(stressPatterns([session()]).hours[9].score, null);
  const result = stressPatterns([session(), session(1), session(2), session(3, { source: 'demo' }), session(4, { status: 'active' })]);
  assert.equal(result.sessionCount, 3);
  assert.equal(result.hours[9].score, 50);
  assert.equal(result.hours[9].observedSeconds, 900);
  assert.equal(result.hours[9].confidence, 'limited');
  assert.equal(result.hours[10].score, null);
  assert.equal(stressPatterns([session(), session(1), session(2)], 'America/Chicago').hours[4].score, 50);
});
test('gaps, exclusions, poor metric confidence, breaks and same-day repeats do not invent evidence', () => {
  const s = session();
  s.samples = [s.samples[0], { ...s.samples[1], excludedFromAnalysis: true }, { ...s.samples[2], onBreak: true }, { ...s.samples[3], qualityByMetric: { heartRate: 0.1, breathingRate: 1 } }];
  assert.equal(stressPatterns([s]).hours[9].observedSeconds, 10);
  assert.equal(stressPatterns([session(), session(0, { id: 'b' }), session(0, { id: 'c' })]).hours[9].score, null);
  assert.throws(() => stressPatterns([], 'bad-zone'), { status: 400 });
});
test('clock-hour boundaries split observed duration', () => {
  const start = Date.parse('2026-09-01T09:59:55Z');
  const s = session(0, { startedAt: start, endedAt: start + 10000 });
  s.samples = [{ ...s.samples[0], timestamp: start }];
  const p = stressPatterns([s]);
  assert.equal(p.hours[9].observedSeconds, 5);
  assert.equal(p.hours[10].observedSeconds, 5);
});
test('recommendations respect full duration, buffer, future times and unknown data', () => {
  const patterns = stressPatterns([session(), session(1), session(2)]);
  const window = { start: stamp, end: stamp + 4 * 3600000, durationMinutes: 60 };
  const slots = suggestSlots(patterns, [], window, stamp);
  assert.equal(slots[0].score, 50);
  assert.equal(slots[0].start, stamp);
  const plans = [{ start: stamp + 3600000, end: stamp + 2 * 3600000 }];
  const blocked = suggestSlots(patterns, plans, window, stamp);
  assert.ok(blocked.every(s => s.start >= plans[0].end + 900000));
  assert.ok(blocked.every(s => s.score === null));
  assert.equal(suggestSlots(patterns, [], window, window.end).length, 0);
  assert.throws(() => suggestSlots(patterns, [], { ...window, durationMinutes: 0 }), { status: 400 });
});
test('biometric summary uses individual confidence and preserves missing HRV and gaps', () => {
  const s = session();
  s.samples = [{ ...s.samples[0], qualityByMetric: { heartRate: 1, breathingRate: 0, hrv: 0 } }, { ...s.samples[1], excludedFromAnalysis: true }];
  const result = summarize(s);
  assert.equal(result.biometrics.heartRate.average, 72);
  assert.equal(result.biometrics.breathingRate.average, null);
  assert.equal(result.biometrics.hrv.average, null);
  assert.equal(result.biometrics.heartRate.timeline[1].value, null);
});
test('planner writes and deletion use the repository and validate dates', async t => {
  const repo = sqliteRepository(':memory:'); t.after(() => repo.close());
  const planner = plannerService(repo, () => stamp);
  const plan = await planner.create({ title: 'Study', start: stamp + 3600000, end: stamp + 7200000, timeZone: 'UTC' });
  assert.deepEqual(await planner.list(), [plan]);
  await assert.rejects(planner.create({ title: 'Overlap', start: plan.start, end: plan.end }), { status: 409 });
  await assert.rejects(planner.create({ title: 'Past', start: stamp - 1, end: stamp + 1 }), { status: 400 });
  await planner.remove(plan.id); assert.deepEqual(await planner.list(), []);
});
test('simultaneous planner saves cannot reserve the same time twice', async t => {
  const repo = sqliteRepository(':memory:'); t.after(() => repo.close());
  const planner = plannerService(repo, () => stamp);
  const request = { title: 'Study', start: stamp + 3600000, end: stamp + 7200000, timeZone: 'UTC' };
  const results = await Promise.allSettled([planner.create(request), planner.create(request)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal((await planner.list()).length, 1);
  // A rejected duplicate must not prevent later valid saves.
  const later = await planner.create({ ...request, start: request.end + 900000, end: request.end + 4500000 });
  assert.equal((await planner.list()).length, 2);
  assert.equal(later.start, request.end + 900000);
});
test('Supabase plans use the private planner table', async () => {
  const calls = [];
  const repo = supabaseRepository('https://example.supabase.co', 'sb_secret_test', async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => [] }; });
  await repo.listPlans(); await repo.insertPlan({ id: 'a', start: stamp }); await repo.deletePlan('a');
  assert.ok(calls.every(c => c.url.includes('/rest/v1/planner_records')));
  assert.equal(calls[2].options.method, 'DELETE');
});
test('HTTP planner lifecycle and validation', async t => {
  const app = createApp({ repository: sqliteRepository(':memory:'), now: () => stamp });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await app.locals.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await fetch(base + '/analytics/patterns?timeZone=bad')).status, 400);
  const created = await fetch(base + '/plans', post({ title: 'Read', start: stamp + 3600000, end: stamp + 7200000 }));
  assert.equal(created.status, 201); const plan = await created.json();
  assert.equal((await (await fetch(base + '/plans')).json()).length, 1);
  const suggested = await fetch(base + '/plans/suggest', post({ start: stamp, end: stamp + 4 * 3600000, timeZone: 'UTC' }));
  assert.equal(suggested.status, 200); assert.ok((await suggested.json()).every(s => s.score === null));
  assert.equal((await fetch(base + '/plans/' + plan.id, { method: 'DELETE' })).status, 200);
  assert.deepEqual(await (await fetch(base + '/plans')).json(), []);
});
