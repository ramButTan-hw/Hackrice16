import test from 'node:test';
import assert from 'node:assert/strict';
import {rehearsalEnvironment} from '../scripts/rehearsal-env.js';
import {checkinEvidence} from '../server/checkin-evidence.js';
import {sqliteRepository} from '../server/repository.js';
import {sessionService} from '../server/session-service.js';
import {monitoringService} from '../server/monitor.js';

test('rehearsal isolates storage and credentials without modifying the normal environment', () => {
  const original = {DATA_PROVIDER: 'supabase', DATABASE_PATH: 'personal.sqlite', GEMINI_API_KEY: 'private', GEMINI_IMAGE_API_KEY: 'image-private',
    ELEVENLABS_API_KEY: 'speech-private', PRESAGE_API_KEY: 'camera-private', BACKBOARD_API_KEY: 'memory-private',
    GOOGLE_CLIENT_ID: 'google-private', GOOGLE_CLIENT_SECRET: 'secret', SUPABASE_URL: 'https://example.test', SUPABASE_SECRET_KEY: 'database-private', ELECTRON_RUN_AS_NODE: '1'};
  const rehearsal = rehearsalEnvironment(original, '/temporary/rehearsal');
  assert.equal(rehearsal.DATA_PROVIDER, 'sqlite');
  assert.notEqual(rehearsal.DATABASE_PATH, original.DATABASE_PATH);
  assert.equal(rehearsal.JARVIS_REHEARSAL, '1');
  assert.equal(rehearsal.ELECTRON_RUN_AS_NODE, undefined);
  for (const key of Object.keys(original).filter(key => /KEY|SECRET|CLIENT_ID|SUPABASE_URL/.test(key))) assert.equal(rehearsal[key], '');
  assert.equal(original.GEMINI_API_KEY, 'private');assert.equal(original.DATA_PROVIDER, 'supabase');
});

test('check-in explanation captures actual evidence, never inventing missing physiology', () => {
  const pulse = {baseline: {bpm: 72}, smoothed: 94, delta: 22, threshold: 8.64, elevatedSeconds: 30};
  const evidence = checkinEvidence({event: 'physiological_change', source: 'demo', pulseEvidence: pulse});
  pulse.smoothed = 75;
  assert.equal(evidence.recentBpm, 94);assert.equal(evidence.source, 'demo');
  assert.equal(evidence.sustainedSeconds, 30);
  assert.equal(checkinEvidence({event: 'long_work_block', source: 'presage'}).baselineBpm, undefined);
  assert.equal(checkinEvidence({event: 'physiological_change', source: 'presage'}).baselineBpm, undefined);
});

test('missing AI key delivers one local check-in only for the explicit simulated scenario', async () => {
  let now = 1000000, calls = 0;
  const repo = sqliteRepository(':memory:'), sessions = sessionService(repo, () => now);
  const monitor = monitoringService({sessions, now: () => now, configured: () => false, insight: () => {calls++; throw new Error('Must not call');}});
  try {
    const demo = await sessions.start({goal: 'Rehearse biology review', source: 'demo', demoScenario: 'sustained_pulse'});
    const real = await sessions.start({goal: 'Real session', source: 'presage'});
    await monitor.configure(demo.id, {enabled: true});await monitor.configure(real.id, {enabled: true});
    for (let offset = 0; offset <= 120000; offset += 2000) {now = demo.startedAt + offset; await monitor.tick();}
    const result = await sessions.get(demo.id);
    assert.equal(calls, 0);assert.equal(result.interventions.length, 1);
    assert.equal(result.interventions[0].provider, 'demo');assert.equal(result.interventions[0].evidence.source, 'demo');
    assert.equal(result.monitor.error, null);assert.equal(result.monitor.calls, 1);
    assert.equal(result.events.some(event => event.source === 'gemini'), false);
    now = real.startedAt + 40 * 60000;await monitor.tick();
    const actual = await sessions.get(real.id);
    assert.equal(actual.interventions.length, 0);assert.match(actual.monitor.error, /GEMINI_API_KEY/);
  } finally {await monitor.close();repo.close();}
});
