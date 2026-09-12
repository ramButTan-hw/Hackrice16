import { randomUUID } from 'node:crypto';
import { fail } from '../shared/contracts.js';
import { matlabWorker } from './matlab.js';
import { analyzeInsight } from './insights.js';
import { generateSpeech } from './speech.js';
import { appendEvent } from './event-log.js';

export const MONITOR = Object.freeze({ analysisMs: 10000, regularMs: 60000, minimumMs: 45000, interventionMs: 90000, budget: 6, warmupMs: 60000, staleMs: 10000 });
export function monitoringService({ sessions, now = Date.now, matlab = matlabWorker(), insight = analyzeInsight, speech = generateSpeech, configured = () => Boolean(process.env.GEMINI_API_KEY) }) {
  const active = new Map();
  const audio = new Map();
  let timer, pending = false, closed = false;
  const fresh = s => s.activity && now() - s.activity.timestamp <= MONITOR.staleMs && s.samples.at(-1) && now() - s.samples.at(-1).timestamp <= MONITOR.staleMs;
  async function configure(id, body) {
    if (typeof body?.enabled !== 'boolean' || (body.voice !== undefined && typeof body.voice !== 'boolean')) fail('Invalid monitoring settings.');
    const current = active.get(id);
    if (body.enabled && current && !current.abort.signal.aborted) {
      if (body.voice === false) audio.delete(id);
      return (await sessions.update(id, s => { if (body.voice !== undefined) s.monitor.voice = body.voice; })).monitor;
    }
    current?.abort.abort();
    active.delete(id); audio.delete(id);
    const s = await sessions.update(id, session => {
      session.monitor = { calls: 0, decisions: [], ...session.monitor, enabled: body.enabled, voice: body.voice ?? session.monitor?.voice ?? false, status: body.enabled ? 'calibrating' : 'paused', error: null };
      appendEvent(session, now(), 'monitor', body.enabled ? 'started' : 'paused');
    });
    if (body.enabled && !closed) {
      active.set(id, { abort: new AbortController(), lastAnalysis: -Infinity, candidate: '', since: now() });
      if (!timer) { timer = setInterval(() => { void tick(); }, 2000); timer.unref?.(); }
    }
    return s.monitor;
  }
  async function activity(id, body) {
    if (!Number.isFinite(body?.idleSeconds) || body.idleSeconds < 0 || body.idleSeconds > 604800) fail('Invalid idle time.');
    await sessions.update(id, s => { s.activity = { idleSeconds: body.idleSeconds, timestamp: now() }; });
    return { ok: true };
  }
  async function run(id, state) {
    const alive = () => !closed && active.get(id) === state && !state.abort.signal.aborted;
    let s = await sessions.get(id);
    if (s.status !== 'active' || !s.monitor?.enabled) { active.delete(id); return; }
    if (now() - state.lastAnalysis < MONITOR.analysisMs) return;
    state.lastAnalysis = now();
    if (!fresh(s)) {
      await sessions.update(id, s => { s.monitor.status = 'waiting_signal'; s.monitor.waitReason = !s.samples.length ? 'No Presage vital measurements received yet.' : 'Waiting for fresh Presage samples and inactivity heartbeat.'; appendEvent(s, now(), 'monitor', 'waiting', { reason: s.monitor.waitReason }); });
      return;
    }
    await sessions.update(id, s => { s.monitor.status = 'analyzing_matlab'; s.monitor.error = null; appendEvent(s, now(), 'matlab', 'request', { sampleCount: s.samples.length }); });
    const report = await matlab.analyze(s, now());
    if (!alive()) return;
    s = await sessions.get(id);
    if (s.status !== 'active' || !s.monitor.enabled) return;
    if (!fresh(s) || now() - report.timestamp > 15000) {
      await sessions.update(id, s => { s.monitor.status = 'waiting_signal'; s.monitor.waitReason = 'Analysis finished with stale input; waiting for the next window.'; appendEvent(s, now(), 'matlab', 'stale_result', report); }); return;
    }
    const warmed = now() - s.startedAt >= MONITOR.warmupMs;
    await sessions.update(id, s => {
      s.monitor.matlab = report; s.monitor.status = warmed ? (report.ready ? 'watching' : 'limited_data') : 'calibrating';
      s.monitor.waitReason = warmed ? (report.ready ? null : 'Physiology is not reliable yet. Gemini will review task/activity with that limitation.') : `First analysis in about ${Math.ceil((MONITOR.warmupMs - (now() - s.startedAt)) / 1000)} seconds.`;
      appendEvent(s, now(), 'matlab', 'result', report);
    });
    if (!warmed) return;
    if (!configured()) throw new Error('Add GEMINI_API_KEY and restart the backend for automatic analysis.');
    if (s.monitor.calls >= MONITOR.budget) {
      await sessions.update(id, s => { s.monitor.status = 'budget_reached'; }); return;
    }
    const signature = `${report.heartRateChangePercent > 20 && report.breathingRateChangePercent > 20 ? 'elevated' : 'stable'}:${s.activity.idleSeconds >= 45 ? 'idle' : 'active'}`;
    if (signature !== state.candidate) { state.candidate = signature; state.since = now(); }
    const gap = now() - (s.monitor.lastCallAt ?? -Infinity);
    const changed = signature !== s.monitor.lastSignature && now() - state.since >= 10000;
    if (gap < MONITOR.minimumMs || (gap < MONITOR.regularMs && !changed)) {
      await sessions.update(id, s => { s.monitor.nextAnalysisAt = s.monitor.lastCallAt + MONITOR.regularMs; }); return;
    }
    const last = s.samples.at(-1);
    const quality = key => last.qualityByMetric?.[key] ?? last.quality;
    const snapshot = {
      task: s.goal, source: s.source, elapsedSeconds: Math.floor((now() - s.startedAt) / 1000),
      matlab: report,
      physiologyReliable: report.ready,
      limitations: report.reason ?? (report.ready ? 'Use only reliable measurements.' : 'No reliable physiological baseline. Do not infer stress, focus or physiological change.'),
      presage: { timestamp: last.timestamp, source: last.source, heartRate: quality('heartRate') >= .7 ? last.heartRate : null, breathingRate: quality('breathingRate') >= .7 ? last.breathingRate : null, hrv: quality('hrv') >= .7 ? last.hrv : null, qualityByMetric: { heartRate: quality('heartRate'), breathingRate: quality('breathingRate'), hrv: quality('hrv') } },
      inactivity: s.activity,
      previousIntervention: s.interventions.at(-1) ? { text: s.interventions.at(-1).text, timestamp: s.interventions.at(-1).timestamp } : null,
    };
    // Reserve BEFORE the request; failed attempts and restarts cannot evade the budget.
    let reserved = false;
    await sessions.update(id, s => {
      if (!alive() || !s.monitor.enabled || s.monitor.calls >= MONITOR.budget) return;
      s.monitor.calls++; s.monitor.lastCallAt = now(); s.monitor.lastSignature = signature; s.monitor.status = 'analyzing_gemini'; s.monitor.waitReason = null; s.monitor.nextAnalysisAt = now() + MONITOR.regularMs; appendEvent(s, now(), 'gemini', 'request', snapshot); reserved = true;
    });
    if (!reserved || !alive()) return;
    const result = await insight(snapshot, { signal: state.abort.signal });
    if (!alive()) return;
    s = await sessions.get(id);
    if (s.status !== 'active' || !s.monitor.enabled || !fresh(s)) return;
    let intervention;
    await sessions.update(id, s => {
      if (!alive() || !s.monitor.enabled || !fresh(s)) return;
      const previous = s.interventions.at(-1);
      const allowed = result.decision === 'intervene' && (!previous || now() - previous.timestamp >= MONITOR.interventionMs);
      const decision = { ...result, timestamp: now(), delivered: allowed };
      s.monitor.decisions.push(decision);
      s.monitor.decisions = s.monitor.decisions.slice(-MONITOR.budget);
      s.monitor.status = 'watching';
      appendEvent(s, now(), 'gemini', 'response', decision);
      if (allowed) {
        intervention = { id: randomUUID(), timestamp: now(), text: result.message, provider: 'gemini', state: signature };
        s.interventions.push(intervention);
      }
    });
    const latest = intervention && alive() ? await sessions.get(id) : null;
    if (intervention && latest?.status === 'active' && latest.monitor.enabled && latest.monitor.voice && alive()) {
      const voice = await speech(intervention.text);
      const current = alive() ? await sessions.get(id) : null;
      if (alive() && current?.status === 'active' && current.monitor.voice) audio.set(id, { ...voice, interventionId: intervention.id });
    }
  }
  async function tick() {
    if (pending || closed) return;
    pending = true;
    try {
      for (const [id, state] of active) {
        try { await run(id, state); }
        catch (error) {
          if (active.get(id) !== state || state.abort.signal.aborted) continue;
          await sessions.update(id, s => { const stage = s.monitor.status; s.monitor.status = 'error'; s.monitor.error = error.message; appendEvent(s, now(), 'monitor', 'error', { stage, message: error.message }); }).catch(() => {});
        }
      }
    } finally { pending = false; }
  }
  return {
    configure, activity, tick,
    async status(id) { const s = await sessions.get(id); return { ...s.monitor, audio: audio.get(id), budget: MONITOR.budget }; },
    async stop(id) { active.get(id)?.abort.abort(); active.delete(id); audio.delete(id); },
    async close() { closed = true; clearInterval(timer); for (const state of active.values()) state.abort.abort(); active.clear(); await matlab.close(); },
  };
}
