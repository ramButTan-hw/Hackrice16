export default function CheckinEvidence({evidence}) {
  if (!evidence) return null;
  return <details className="checkin-evidence"><summary>Why Acumen checked in</summary>
    <p>{evidence.source === 'demo' ? 'Simulated evidence' : 'Session evidence'} · {evidence.explanation}</p>
    {Number.isFinite(evidence.baselineBpm) && <>
      <p>Baseline {evidence.baselineBpm.toFixed(1)} bpm → recent {evidence.recentBpm.toFixed(1)} bpm.
        {' '}The rise stayed above the {evidence.thresholdBpm.toFixed(1)} bpm threshold for {Math.round(evidence.sustainedSeconds)} seconds.</p>
      <p>{evidence.signal}</p>
    </>}
  </details>;
}
