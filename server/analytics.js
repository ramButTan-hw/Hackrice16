import { RULES } from '../shared/contracts.js';
import { mean, usable } from './state-engine.js';
export function summarize(session, now = Date.now()) {
  const end = session.endedAt ?? now;
  const valid = session.samples.filter(usable);
  const stateSeconds = { unknown: 0, calibrating: 0, steady: 0, elevated: 0, away: 0, break: 0 };
  stateSeconds.unknown += Math.max(0, Math.min(session.samples[0]?.timestamp ?? end, end) - session.startedAt) / 1000;
  session.samples.forEach((s, index) => {
    const gap = Math.max(0, Math.min(session.samples[index + 1]?.timestamp ?? end, end) - s.timestamp);
    stateSeconds[s.state] += Math.min(gap, RULES.staleMs) / 1000;
    stateSeconds.unknown += Math.max(0, gap - RULES.staleMs) / 1000;
  });
  const changes = session.interventions.map(i => {
    const before = valid.filter(s => s.timestamp >= i.timestamp - 30000 && s.timestamp < i.timestamp);
    const after = valid.filter(s => s.timestamp > i.timestamp && s.timestamp <= i.timestamp + 30000);
    const ready = end >= i.timestamp + 30000 && before.length >= 3 && after.length >= 3;
    return { interventionId: i.id, status: ready ? 'available' : 'insufficient-data', heartRateChange: ready ? mean(after.map(s => s.heartRate)) - mean(before.map(s => s.heartRate)) : null };
  });
  return {
    sessionId: session.id, source: session.source, durationSeconds: Math.max(0, end - session.startedAt) / 1000,
    sampleCount: session.samples.length, validSampleCount: valid.length,
    averageHeartRate: mean(valid.map(s => s.heartRate)), averageBreathingRate: mean(valid.map(s => s.breathingRate)),
    averageHrv: mean(valid.map(s => s.hrv).filter(v => v !== null)), stateSeconds,
    interventionCount: session.interventions.length, interventionChanges: changes,
    interpretation: 'Descriptive signal statistics. Before/after differences do not establish intervention effectiveness or causation.',
  };
}
