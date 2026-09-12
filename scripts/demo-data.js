import { mkdirSync, writeFileSync } from 'node:fs';
import { sqliteRepository } from '../server/repository.js';
import { sessionService } from '../server/session-service.js';
// Isolated deterministic fixture: never reads .env or writes to Supabase.
mkdirSync('artifacts', { recursive: true });
const repository = sqliteRepository('artifacts/demo.sqlite');
let clock = Date.now() - 120000;
const service = sessionService(repository, () => clock);
try {
  const session = await service.start({ goal: 'Prove the sensing → state → intervention → report contract', source: 'demo' });
  for (let index = 0; index < 60; index++) {
    clock += 2000;
    const elevated = index >= 15 && index < 30;
    const result = await service.ingest(session.id, { timestamp: clock, source: 'demo', heartRate: elevated ? 96 : 72, breathingRate: elevated ? 20 : 14, hrv: elevated ? 35 : 48, quality: 0.95, idleSeconds: 0, onBreak: false });
    if (result.workState.shouldIntervene) await service.intervene(session.id, { provider: 'demo', text: 'Your simulated readings are elevated. Would you like a short break?' });
  }
  clock += 2000;
  const complete = await service.end(session.id);
  writeFileSync('artifacts/demo-session.json', JSON.stringify(complete, null, 2));
  writeFileSync('artifacts/demo-summary.json', JSON.stringify(await service.summary(session.id), null, 2));
  console.log('Created artifacts/demo-session.json, demo-summary.json, and demo.sqlite.');
  console.log(JSON.stringify(await service.summary(session.id), null, 2));
} finally { repository.close(); }
