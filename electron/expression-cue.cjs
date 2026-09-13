// SmartSpectra v3 expression scores are percentages; timestamps are epoch µs.
const EXPRESSIONS_METRIC = 14;
const STALE_MS = 5000;
const tones = { 1: 'gentle', 2: 'neutral', 3: 'neutral', 4: 'gentle', 5: 'upbeat', 6: 'neutral', 7: 'gentle', 8: 'neutral' };

function expressionEstimate(expression, now) {
  if (expression?.stable !== true || !Array.isArray(expression.scores) || !expression.scores.length || expression.scores.length > 9) return null;
  const micros = Number(String(expression.timestamp));
  const observedAt = Math.floor(micros / 1000);
  if (!Number.isSafeInteger(micros) || observedAt <= 0 || now - observedAt > STALE_MS || observedAt > now + 1000) return null;
  const scores = expression.scores;
  if (new Set(scores.map(score => score?.type)).size !== scores.length || scores.some(score => !Number.isInteger(score?.type) || score.type < 0 || score.type > 8 || !Number.isFinite(score.confidence) || score.confidence < 0 || score.confidence > 100)) return null;
  if (scores.reduce((sum, score) => sum + score.confidence, 0) > 101) return null;
  const [first, second] = [...scores].sort((a, b) => b.confidence - a.confidence);
  if (!tones[first.type] || first.confidence < 75 || first.confidence - (second?.confidence ?? 0) < 20) return null;
  return { tone: tones[first.type], observedAt };
}

function createExpressionTracker() {
  let candidate = null, lastTimestamp = 0;
  return {
    reset() { candidate = null; lastTimestamp = 0; },
    observe(expression, now) {
      const estimate = expressionEstimate(expression, now);
      if (!estimate) { candidate = null; return null; }
      // Replayed/out-of-order frames never accumulate evidence or refresh a cue.
      if (estimate.observedAt <= lastTimestamp) return null;
      lastTimestamp = estimate.observedAt;
      if (!candidate || estimate.tone !== candidate.tone || estimate.observedAt - candidate.lastAt > 3000) {
        candidate = { tone: estimate.tone, since: estimate.observedAt, lastAt: estimate.observedAt, count: 1 };
        return null;
      }
      candidate.lastAt = estimate.observedAt;
      candidate.count++;
      if (candidate.count < 3 || estimate.observedAt - candidate.since < 4000) return null;
      return { ...estimate, source: 'presage' };
    },
  };
}

module.exports = { EXPRESSIONS_METRIC, expressionEstimate, createExpressionTracker };
