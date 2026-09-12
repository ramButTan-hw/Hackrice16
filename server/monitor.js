import {pulseTiming} from '../shared/demo.js';
import { randomUUID } from 'node:crypto';
import { fail } from '../shared/contracts.js';
import { analyzeWindow } from './local-analysis.js';
import { analyzeInsight } from './insights.js';
import { appendEvent } from './event-log.js';
import { evaluateBreak, assistanceState, createCheckin } from './break-score.js';
import { feedDemo } from './demo-scenario.js';

export const MONITOR = Object.freeze({ analysisMs: 10000, regularMs: 60000, minimumMs: 45000, interventionMs: 90000, budget: 6, warmupMs: 60000, staleMs: 10000 });
export function monitoringService({ sessions, now = Date.now, analyze = analyzeWindow, insight = analyzeInsight, configured = () => Boolean(process.env.GEMINI_API_KEY) }) {
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
    await feedDemo(sessions,s,now());
    if(s.demoScenario)s=await sessions.get(id);
    if (now() - state.lastAnalysis < MONITOR.analysisMs) return;
    state.lastAnalysis = now();
    let trigger;
    await sessions.update(id,s=>{trigger=evaluateBreak(s,undefined,now());});
    if(trigger){await review(id,state,trigger,null);trigger=null;}
    if (!fresh(s)) {
      await sessions.update(id, s => { s.monitor.status = 'waiting_signal'; s.monitor.waitReason = !s.samples.length ? 'No Presage vital measurements received yet.' : 'Waiting for fresh Presage samples and inactivity heartbeat.'; appendEvent(s, now(), 'monitor', 'waiting', { reason: s.monitor.waitReason }); });
      if(trigger)await review(id,state,trigger,null);
      return;
    }
    await sessions.update(id, s => { s.monitor.status = 'analyzing_local'; appendEvent(s, now(), 'local_analysis', 'request', { sampleCount: s.samples.length }); });
    const report = await analyze(s, now());
    if (!alive()) return;
    s = await sessions.get(id);
    if (s.status !== 'active' || !s.monitor.enabled) return;
    if (!fresh(s) || now() - report.timestamp > 15000) {
      await sessions.update(id, s => { s.monitor.status = 'waiting_signal'; s.monitor.waitReason = 'Analysis finished with stale input; waiting for the next window.'; appendEvent(s, now(), 'local_analysis', 'stale_result', report); }); return;
    }
    const warmupMs=pulseTiming(s).baselineMs;
    const warmed = now() - s.startedAt >= warmupMs;
    await sessions.update(id, s => {
      s.monitor.analysis = report; s.monitor.status = warmed ? (report.ready ? 'watching' : 'limited_data') : 'calibrating';
      s.monitor.waitReason = warmed ? (report.ready ? 'Local monitoring; Gemini runs only for a new check-in event.' : 'Physiology is not reliable yet. No physiological check-in will be generated.') : `Local calibration: about ${Math.ceil((warmupMs - (now() - s.startedAt)) / 1000)} seconds remaining.`;
      appendEvent(s, now(), 'local_analysis', 'result', report);
    });
    if (!warmed) return;
    await sessions.update(id,s=>{
      trigger=evaluateBreak(s,report,now())??trigger;
      const pulse=s.assistance.pulse;
      s.monitor.status=pulse?.baseline?'watching':'calibrating';
      s.monitor.waitReason=pulse?.baseline?`Pulse detector: ${pulse.phase}. Gemini runs only for a new eligible check-in.`:`Collecting ${warmupMs/1000} continuous seconds of reliable pulse for your personal baseline.`;
    });
    if(trigger)await review(id,state,trigger,report);
  }
  async function review(id,state,signature,report){
    const alive=()=>!closed&&active.get(id)===state&&!state.abort.signal.aborted;
    let s=await sessions.get(id);
    const a=assistanceState(s);
    if(a.breakStartedAt||a.checkin||now()<a.quietUntil||now()<(a.helpUntil??0))return;
    if (!configured()) throw new Error('Add GEMINI_API_KEY and restart the backend for automatic analysis.');
    if (s.monitor.calls >= MONITOR.budget) {
      await sessions.update(id, s => { s.monitor.status = 'budget_reached'; }); return;
    }
    if(now()-(s.monitor.lastCallAt??-Infinity)<MONITOR.minimumMs)return;
    const last = s.samples.at(-1);
    const quality = key => last?.qualityByMetric?.[key] ?? last?.quality ?? 0;
    const snapshot = {
      task: s.goal, source: s.source, simulatedBiometrics:s.source==='demo', elapsedSeconds: Math.floor((now() - s.startedAt) / 1000),
      analysis: report,
      event:signature,breakScore:a.score,feeling:a.feeling??null,
      pulseEvidence:a.pulse??null,
      physiologyReliable: signature==='physiological_change' || Boolean(report?.ready),
      limitations: signature==='physiological_change' ? 'Sustained pulse change is a check-in heuristic, not evidence of stress or loss of focus.' : report?.reason ?? 'No reliable physiological baseline. Do not infer stress or focus.',
      presage: last ? { timestamp: last.timestamp, heartRate: quality('heartRate') >= .7 ? last.heartRate : null, breathingRate: quality('breathingRate') >= .7 ? last.breathingRate : null } : null,
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
    let result;
    const requestStarted=Date.now();
    try{
      result=await insight(snapshot,{signal:state.abort.signal,timeoutMs:s.demoScenario?8000:20000});
      await sessions.update(id,s=>{s.monitor.error=null;s.monitor.lastRequestMs=Date.now()-requestStarted;});
    }catch(error){
      if(!alive())return;
      await sessions.update(id,s=>{s.monitor.error=error.name==='TimeoutError'?'Gemini check-in timed out. Voice help is still available.':error.message;s.monitor.lastRequestMs=Date.now()-requestStarted;appendEvent(s,now(),'gemini','failed',{message:s.monitor.error,durationMs:s.monitor.lastRequestMs});});
      if(s.source!=='demo'||!s.demoScenario)throw error;
      result={decision:'intervene',reason:'Demo-only local fallback: Gemini analysis was unavailable.',message:'How’s the work going—would you like a hand?',provider:'demo'};
    }
    if (!alive()) return;
    s = await sessions.get(id);
    if (s.status !== 'active' || !s.monitor.enabled) return;
    let intervention;
    await sessions.update(id, s => {
      if (!alive() || !s.monitor.enabled || now()<assistanceState(s).quietUntil || s.assistance.breakStartedAt || now()<(s.assistance.helpUntil??0)) return;
      const previous = s.interventions.at(-1);
      const allowed = result.decision === 'intervene' && (!previous || now() - previous.timestamp >= MONITOR.interventionMs);
      const decision = { ...result, timestamp: now(), delivered: allowed };
      s.monitor.decisions.push(decision);
      s.monitor.decisions = s.monitor.decisions.slice(-MONITOR.budget);
      s.monitor.status = 'watching';
      appendEvent(s, now(), 'gemini', 'response', decision);
      if (allowed) {
        createCheckin(s,result.message,signature,now());
        intervention = { id: randomUUID(), timestamp: now(), text: result.message, provider: result.provider??'gemini', state: signature };
        s.interventions.push(intervention);
      }
    });

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
    async close() { closed = true; clearInterval(timer); for (const state of active.values()) state.abort.abort(); active.clear();  },
  };
}
