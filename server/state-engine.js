import { RULES } from '../shared/contracts.js';
export const usable = s => s.quality >= RULES.quality && s.heartRate !== null && s.breathingRate !== null;
export const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

// Descriptive prototype rules, not a clinical model or a productivity classifier.
export function deriveState(session, now) {
  const samples = session.samples;
  const latest = samples.at(-1);
  const output = (state, reason, extra = {}) => ({ state, reason, timestamp: now, baseline: session.baseline, shouldIntervene: false, ...extra });
  if (!latest || now - latest.timestamp > RULES.staleMs) return output('unknown', 'No recent sample.');
  if (latest.onBreak) return output('break', 'User marked the session as a break.');
  if (!usable(latest)) return output('unknown', 'Missing readings or insufficient signal quality.');
  if (!session.baseline) {
    // Only a continuous run of usable samples is eligible for calibration.
    let start = samples.length - 1;
    while (start > 0 && usable(samples[start - 1]) && !samples[start - 1].onBreak
      && samples[start].timestamp - samples[start - 1].timestamp <= RULES.staleMs) start--;
    const window = samples.slice(start);
    if (window.length < RULES.baselineSamples || latest.timestamp - window[0].timestamp < RULES.baselineMs) return output('calibrating', 'Collecting 20 seconds of reliable baseline readings.');
    session.baseline = { heartRate: mean(window.map(s => s.heartRate)), breathingRate: mean(window.map(s => s.breathingRate)), establishedAt: latest.timestamp };
  }
  if (latest.idleSeconds >= 120) return output('away', 'Reported keyboard/mouse inactivity is at least two minutes.');
  let start = samples.length;
  while (start > 0) {
    const s = samples[start - 1];
    if (!usable(s) || s.onBreak || s.idleSeconds >= 120 || s.timestamp <= session.baseline.establishedAt
      || s.heartRate <= session.baseline.heartRate * (1 + RULES.elevation)
      || s.breathingRate <= session.baseline.breathingRate * (1 + RULES.elevation)
      || (start < samples.length && samples[start].timestamp - s.timestamp > RULES.staleMs)) break;
    start--;
  }
  const sustained = start < samples.length && samples.length - start >= 3 && latest.timestamp - samples[start].timestamp >= RULES.sustainedMs;
  const last = session.interventions.at(-1);
  if (sustained) return output('elevated', 'Heart and breathing rates stayed over 20% above baseline for at least six seconds.', {
    shouldIntervene: !last || now - last.timestamp >= RULES.cooldownMs,
  });
  return output('steady', 'No sustained elevation detected relative to this session baseline.');
}
