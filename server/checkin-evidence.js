// Capture the evidence used for this invitation, before later readings change it.
// These fields explain a heuristic; they are not a stress score or diagnosis.
export function checkinEvidence(snapshot) {
  const evidence = {source: snapshot.source, event: snapshot.event, explanation: 'An invitation to check in, not a measurement of stress.'};
  const pulse = snapshot.pulseEvidence;
  if (snapshot.event === 'physiological_change' && pulse?.baseline &&
      [pulse.baseline.bpm, pulse.smoothed, pulse.delta, pulse.threshold, pulse.elevatedSeconds].every(Number.isFinite)) {
    Object.assign(evidence, {baselineBpm: pulse.baseline.bpm, recentBpm: pulse.smoothed,
      changeBpm: pulse.delta, thresholdBpm: pulse.threshold, sustainedSeconds: pulse.elevatedSeconds,
      signal: 'Only fresh, reliable pulse readings count toward this sustained change.'});
  } else if (snapshot.event === 'long_work_block') {
    evidence.explanation = 'A long uninterrupted work block prompted this invitation. No physiological conclusion is needed.';
  }
  return evidence;
}
