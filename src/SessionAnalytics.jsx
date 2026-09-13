import React, { useEffect, useState } from 'react';
import './insights.css';
const units = { heartRate: 'bpm', breathingRate: '/ min', hrv: 'ms' };
const labels = { heartRate: 'Heart rate', breathingRate: 'Breathing rate', hrv: 'Heart rate variability' };
const number = value => value == null ? '—' : value.toFixed(1);
function Trend({ metric, start, end, label }) {
  const points = metric.timeline;
  if (!metric.count) return <p>No reliable readings available.</p>;
  const spread = Math.max(1, metric.max - metric.min);
  const segments = []; let segment = [], last = null;
  for (const p of points) {
    if (p.value === null || (last !== null && p.timestamp - last > 10000)) { if (segment.length) segments.push(segment); segment = []; }
    if (p.value !== null) segment.push(`${5 + (p.timestamp - start) / Math.max(1, end - start) * 310},${65 - (p.value - metric.min) / spread * 55}`);
    last = p.timestamp;
  }
  if (segment.length) segments.push(segment);
  return <svg className="bio-chart" viewBox="0 0 320 75" role="img" aria-label={`${label} over the session. Minimum ${number(metric.min)}, maximum ${number(metric.max)}. Gaps indicate missing signals.`}>{segments.map((s, i) => s.length === 1 ? <circle key={i} cx={s[0].split(',')[0]} cy={s[0].split(',')[1]} r="2" fill="currentColor"/> : <polyline key={i} points={s.join(' ')} fill="none" stroke="currentColor" strokeWidth="2"/>)}</svg>;
}
export default function SessionAnalytics({ session, api, onPlan }) {
  const [mode, setMode] = useState('prompt');
  const [stats, setStats] = useState(null), [error, setError] = useState('');
  useEffect(() => { setMode('prompt'); setStats(null); setError(''); }, [session.id]);
  useEffect(() => {
    if (mode !== 'report') return;
    let cancelled = false;
    api(`/sessions/${session.id}/summary`).then(s => { if (!cancelled) setStats(s); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [session.id, mode]);
  if (mode === 'dismissed') return <button className="insight-link" onClick={() => setMode('report')}>View session analytics</button>;
  return <section className="insight-card" aria-label="Session analytics">
    <span className="eyebrow">JARVIS · SESSION COMPLETE</span>
    {mode === 'prompt' ? <><h2>Want to review your session analytics?</h2><p>See your biometric trends, time in each signal state, and check-ins.</p><div className="insight-actions"><button onClick={() => setMode('report')}>Show analytics</button><button onClick={() => setMode('dismissed')}>Not now</button></div></> : <>
      <h2>Your session, in perspective.</h2>
      {error ? <p role="alert">{error}</p> : !stats ? <p role="status">Loading analytics…</p> : <>
        <p>{Math.round(stats.durationSeconds / 60)} minutes · {stats.sampleCount} samples · {stats.interventionCount} check-ins{session.source === 'demo' ? ' · Simulated data' : ''}</p>
        {Object.entries(stats.biometrics).map(([key, metric]) => <div className="bio-metric" key={key}><div className="bio-heading"><span>{labels[key]}</span><strong>{number(metric.average)} <small>{units[key]}</small></strong></div><Trend metric={metric} start={session.startedAt} end={session.endedAt} label={labels[key]}/><p>{metric.count} reliable readings{metric.count > 0 && ` · Range ${number(metric.min)}–${number(metric.max)} ${units[key]}`}</p></div>)}
        <h3>Time in each signal state</h3>
        <div className="state-bars">{Object.entries(stats.stateSeconds).filter(([, seconds]) => seconds > 0).map(([state, seconds]) => <div key={state}><span>{state}</span><progress aria-label={`${state} time`} value={seconds} max={Math.max(1, stats.durationSeconds)}/><small>{(seconds / 60).toFixed(1)}m</small></div>)}</div>
        <p className="insight-footnote">Signal changes can have many causes. These are descriptive readings, not a measure or diagnosis of stress. Missing HRV is never estimated.</p>
        <button className="insight-link" onClick={onPlan}>Use your history to plan a work block →</button>
      </>}
    </>}
  </section>;
}
