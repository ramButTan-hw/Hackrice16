// Exercises the real local services with a virtual clock and disposable storage.
// Does not load .env, open devices, or call providers.
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sqliteRepository} from '../server/repository.js';
import {sessionService} from '../server/session-service.js';
import {monitoringService} from '../server/monitor.js';
import {widgetService} from '../server/widgets.js';
import {plannerService} from '../server/planner.js';

const folder = mkdtempSync(join(tmpdir(), 'jarvis-demo-check-'));
const file = join(folder, 'rehearsal.sqlite');
let now = Date.UTC(2026, 8, 13, 12), repo = sqliteRepository(file), monitor;
try {
  const sessions = sessionService(repo, () => now), widgets = widgetService(repo, () => now), planner = plannerService(repo, () => now);
  monitor = monitoringService({sessions, now: () => now, configured: () => false,
    insight: () => {throw new Error('The offline verification must never call a provider.');}});
  const session = await sessions.start({goal: 'Rehearsal: prepare for my biology exam', source: 'demo', demoScenario: 'sustained_pulse'});
  await monitor.configure(session.id, {enabled: true});
  for (let offset = 0; offset <= 120000; offset += 2000) {now = session.startedAt + offset; await monitor.tick();}
  const active = await sessions.get(session.id);
  assert.equal(active.interventions.length, 1);
  assert.equal(active.interventions[0].provider, 'demo');
  assert.equal(active.interventions[0].evidence.source, 'demo');
  assert.ok(active.interventions[0].evidence.sustainedSeconds >= 30);
  assert.equal(active.events.some(event => event.source === 'gemini'), false);
  console.log('PASS: synthetic signal → sustained-change evidence → one labeled local check-in.');

  const checklist = await widgets.update('checklist', {action: 'add', items: ['Review cells', 'Practice five questions', 'Review mistakes']});
  await widgets.update('checklist', {action: 'toggle', id: checklist.items[0].id, done: true});
  const timer = await widgets.update('timer', {action: 'start', minutes: 1});
  now += 10000;
  assert.equal((await widgets.update('timer', {action: 'ensure_running'})).endsAt, timer.endsAt);
  await widgets.update('timer', {action: 'pause'});
  console.log('PASS: checklist completion and timer start/pause preserve existing work.');

  await monitor.stop(session.id);await sessions.end(session.id);await monitor.close();
  const summary = await sessions.summary(session.id);
  assert.equal(summary.biometrics.hrv.average, null);
  assert.ok(Object.values(summary.stateSeconds).every(Number.isFinite));
  assert.equal(Object.values(summary.stateSeconds).reduce((a, b) => a + b, 0), summary.durationSeconds);
  const patterns = await planner.patterns('UTC');
  assert.equal(patterns.sessionCount, 0);assert.ok(patterns.hours.every(hour => hour.score === null));
  const slots = await planner.suggest({start: now + 60000, end: now + 4 * 3600000, durationMinutes: 30, timeZone: 'UTC'});
  assert.ok(slots.length > 0);assert.equal(slots[0].score, null);
  const plan = await planner.create({title: 'Biology: review mistakes', ...slots[0], timeZone: 'UTC'});
  await assert.rejects(planner.create({...plan}), error => error.status === 409);
  console.log('PASS: report totals are finite; missing HRV stays unknown; simulated history cannot rank plans.');
  repo.close();repo = sqliteRepository(file);
  assert.equal((await repo.get(session.id)).status, 'ended');
  assert.equal((await repo.getWidget('checklist')).items[0].done, true);
  assert.equal((await repo.getWidget('timer')).status, 'paused');
  assert.equal((await repo.listPlans())[0].id, plan.id);
  console.log('PASS: session, checklist, timer, and next work block survive database reopen.');
  console.log('Local workflow verified. This does not verify microphone, camera, Google, AI or native guide input.');
} finally {
  await monitor?.close();repo.close();rmSync(folder, {recursive: true, force: true});
}
