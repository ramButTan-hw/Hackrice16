import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { matlabWorker } from '../server/matlab.js';

// Synthetic fixture only; does not open a camera or call Gemini/ElevenLabs.
const worker = matlabWorker();
const timestamp = Date.now();
const samples = Array.from({ length: 61 }, (_, i) => ({ timestamp: timestamp - 120000 + i * 2000, source: 'demo', heartRate: i <= 15 ? 70 : 70 + (i - 15) * .4, breathingRate: i <= 15 ? 14 : 14 + (i - 15) * .1, hrv: null, quality: 1, onBreak: false, idleSeconds: 0 }));
try {
  console.log('Starting persistent MATLAB worker...');
  await worker.start();
  const report = await worker.analyze({ samples }, timestamp);
  assert.equal(report.provider, 'matlab');
  assert.equal(report.ready, true);
  assert.equal(report.baselineHeartRate, 70);
  assert.equal(report.validSampleCount, 31);
  assert.ok(Math.abs(report.heartRateSlopePerMinute - 12) < .001);
  const poor = await worker.analyze({ samples: samples.map(s => ({ ...s, quality: .1 })) }, timestamp);
  assert.equal(poor.ready, false); assert.equal(poor.heartRateMean, null);
  const empty = await worker.analyze({ samples: [] }, timestamp);
  assert.equal(empty.ready, false); assert.equal(empty.validSampleCount, 0);
  const heartOnly = await worker.analyze({ samples: samples.map(s => ({ ...s, breathingRate: null, quality: 0, qualityByMetric: { heartRate: .9, breathingRate: 0, hrv: 0 } })) }, timestamp);
  assert.equal(heartOnly.ready, true); assert.equal(heartOnly.heartRateReady, true);
  assert.equal(heartOnly.breathingReady, false); assert.equal(heartOnly.breathingRateMean, null);
  assert.equal(heartOnly.baselineHeartRate, 70);
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/matlab-window-verification.json', JSON.stringify({ source: 'synthetic verification', report, poor, empty }, null, 2));
  console.log('PASS: real MATLAB rolling trends, fixed baseline, heart-only data, poor-quality and empty windows; same worker reused.');
} finally { await worker.close(); }
