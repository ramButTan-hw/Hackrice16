// Team contract v1. All timestamps are Unix milliseconds. Missing readings are null.
export const RULES = Object.freeze({ baselineMs: 20000, baselineSamples: 5, staleMs: 10000, quality: 0.7, elevation: 0.2, sustainedMs: 6000, cooldownMs: 60000, maxSamples: 3600 });
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export function text(value, name, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${name} must contain 1–${max} characters.`);
  return value.trim();
}
/** @typedef {{timestamp:number, source:'demo'|'presage', heartRate:number|null, breathingRate:number|null, hrv:number|null, quality:number, idleSeconds:number, onBreak:boolean}} MetricSample */
export function metric(input, source, startedAt, now, lastTimestamp = 0) {
  if (!input || input.source !== source) fail('Metric source must match the session source.');
  if (!Number.isSafeInteger(input.timestamp) || input.timestamp < startedAt || input.timestamp <= lastTimestamp || input.timestamp > now + 5000) fail('Invalid, duplicate, out-of-order, or future timestamp.');
  const result = { timestamp: input.timestamp, source };
  for (const [key, min, max] of [['heartRate', 20, 250], ['breathingRate', 1, 80], ['hrv', 0, 500]]) {
    const value = input[key] ?? null;
    if (value !== null && (!Number.isFinite(value) || value < min || value > max)) fail(`Invalid ${key}.`);
    result[key] = value;
  }
  if (!Number.isFinite(input.quality) || input.quality < 0 || input.quality > 1) fail('quality must be between 0 and 1.');
  result.quality = input.quality;
  if (input.qualityByMetric !== undefined) {
    result.qualityByMetric = {};
    for (const key of ['heartRate', 'breathingRate', 'hrv']) {
      const value = input.qualityByMetric?.[key];
      if (!Number.isFinite(value) || value < 0 || value > 1) fail('Invalid per-metric confidence.');
      result.qualityByMetric[key] = value;
    }
  }
  result.idleSeconds = input.idleSeconds ?? 0;
  result.onBreak = input.onBreak ?? false;
  if (!Number.isFinite(result.idleSeconds) || result.idleSeconds < 0 || typeof result.onBreak !== 'boolean') fail('Invalid behavioral context.');
  return result;
}
