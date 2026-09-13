import Attention from './Attention.jsx';
import { useEffect, useRef, useState } from 'react';
const bridge = window.presage;
function savedExpressionPreference() { try { return localStorage.getItem('companion.expressionResponses') === 'true'; } catch { return false; } }
async function post(id, endpoint, body) {
  const response = await fetch(`/api/sessions/${id}/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const raw = await response.text();
  let data; try { data = JSON.parse(raw); } catch { throw new Error('Monitoring server is restarting or unavailable.'); }
  if (!response.ok) throw new Error(data.error || 'Monitoring connection failed.');
  return data;
}
const labels = { limited_data: 'Reviewing available data; physiology is not reliable yet.', calibrating: 'Establishing a reliable baseline…', waiting_signal: 'Waiting for fresh readings…', analyzing_local: 'Locally analyzing the latest window…', analyzing_gemini: 'Gemini is reviewing the combined signals…', watching: 'Watching for a useful moment to help', budget_reached: 'Analysis budget reached. Monitoring continues.', paused: 'Analysis paused', error: 'Analysis needs attention' };
export default function Presage({ sessionId, enabled, onSample, onRunning, onResponseCue }) {
  const [running, setRunning] = useState(false), [starting, setStarting] = useState(false);
  const [voice, setVoice] = useState(false), [monitor, setMonitor] = useState(null);
  const [hint, setHint] = useState('Camera off. Monitoring starts with your session.');
  const [cameraInfo, setCameraInfo] = useState(null);
  const [logError, setLogError] = useState(''), [connectionError, setConnectionError] = useState('');
  const [expressionResponses, setExpressionResponses] = useState(savedExpressionPreference);
  const [expressionCue, setExpressionCue] = useState(null), [changingExpressions, setChangingExpressions] = useState(false);
  const expressionPreference = useRef(expressionResponses), scope = useRef({sessionId, enabled});
  scope.current = {sessionId, enabled};
  const video = useRef(null), stream = useRef(null), loop = useRef(null);
  const audio = useRef(null);
  const generation = useRef(0), pending = useRef(false), capturing = useRef(false);
  const handlers = useRef({ onSample, onRunning, onResponseCue }); handlers.current = { onSample, onRunning, onResponseCue };
  useEffect(() => { if (!voice || !running) audio.current?.pause(); }, [voice, running]);
  useEffect(() => { setMonitor(null); setConnectionError(''); setLogError(''); }, [sessionId]);
  function release() {
    capturing.current = false; clearTimeout(loop.current);
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    handlers.current.onRunning?.(false);
    setExpressionCue(null); handlers.current.onResponseCue?.(null);
  }
  async function stop() {
    generation.current++; release(); setRunning(false); setStarting(false);
    await Promise.allSettled([bridge?.stop(), sessionId ? post(sessionId, 'monitor', { enabled: false }) : Promise.resolve()]);
  }
  async function start(expressions = expressionPreference.current) {
    if (capturing.current || !enabled || !bridge || !scope.current.enabled || scope.current.sessionId !== sessionId) return;
    capturing.current = true;
    const version = ++generation.current;
    setStarting(true); setHint('Opening camera…');
    try {
      await window.devicePermissions?.ensure('camera');
      const capture = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' } });
      if (version !== generation.current) { capture.getTracks().forEach(track => track.stop()); return; }
      stream.current = capture; video.current.srcObject = capture;
      await video.current.play();
      if (version !== generation.current) return;
      await bridge.start({expressionResponses: expressions});
      if (version !== generation.current) { await bridge.stop(); return; }
      await post(sessionId, 'monitor', { enabled: true, voice });
      if (version !== generation.current) { await post(sessionId, 'monitor', { enabled: false }); return; }
      setRunning(true); handlers.current.onRunning?.(true);
      setHint('Keep your face and chest in view. Monitoring continues across tabs.');
      const canvas = document.createElement('canvas');
      canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
      setCameraInfo({ width: canvas.width, height: canvas.height, fps: null });
      let accepted = 0, measuredAt = performance.now();
      const context = canvas.getContext('2d', { willReadFrequently: true });
      async function frame() {
        if (version !== generation.current) return;
        const began = performance.now();
        try {
          if (video.current?.readyState >= 2) {
            context.drawImage(video.current, 0, 0, canvas.width, canvas.height);
            const sent = await bridge.frame({ data: context.getImageData(0, 0, canvas.width, canvas.height).data.buffer, width: canvas.width, height: canvas.height });
            if (sent) accepted++;
            const elapsed = performance.now() - measuredAt;
            if (elapsed >= 2000 && version === generation.current) {
              setCameraInfo({ width: canvas.width, height: canvas.height, fps: Math.round(accepted * 1000 / elapsed) });
              accepted = 0; measuredAt = performance.now();
            }
          }
          if (version === generation.current) loop.current = setTimeout(frame, Math.max(0, 1000 / 30 - (performance.now() - began)));
        } catch { setHint('Camera processing stopped. Resume monitoring to retry.'); void stop(); }
      }
      void frame();
    } catch (error) {
      if (version === generation.current) { setHint(error.message); await stop(); }
    } finally { if (version === generation.current) setStarting(false); }
  }
  useEffect(() => {
    if (!bridge || !enabled) return;
    let alive = true, polling = false;
    let logQueue = Promise.resolve(), queued = 0;
    const unsubscribe = bridge.subscribe(event => {
      if (['metrics', 'validation', 'error', 'processing', 'stopped'].includes(event.type) && queued < 10) {
        queued++;
        logQueue = logQueue.then(() => post(sessionId, 'events', { event: event.type, data: event.type === 'metrics' ? event.data : event }))
          .then(() => { if (alive) setLogError(''); })
          .catch(error => { if (alive) setLogError('Log could not be saved: ' + error.message); })
          .finally(() => { queued--; });
      }
      if (event.type === 'validation') {
        if (event.code === 0) setHint('Position check passed. Breathe naturally while readings settle.');
        else if (event.code === 7) setHint('Presage has not detected your chest. Include your face, both shoulders and upper torso; check that your shirt is well lit.');
        else setHint(event.hint || 'Presage is checking the camera view.');
      }
      if (event.type === 'error') { setHint(event.message); void stop(); }
      if (event.type === 'stopped') {
        const unexpected = capturing.current;
        generation.current++; release(); setRunning(false); setStarting(false);
        if (unexpected) void post(sessionId, 'monitor', { enabled: false }).catch(() => {});
      }
      if (event.type === 'expression' && capturing.current && expressionPreference.current) {
        const cue = event.cue ? {...event.cue, sessionId} : null;
        setExpressionCue(cue); handlers.current.onResponseCue?.(cue);
      }
      if (event.type === 'sample' && !pending.current && capturing.current) {
        pending.current = true;
        post(sessionId, 'metrics', event.sample).then(data => { if (alive) handlers.current.onSample(data); })
          .catch(error => { if (alive) { setHint(error.message); void stop(); } })
          .finally(() => { pending.current = false; });
      }
    });
    async function refresh() {
      if (polling) return;
      polling = true;
      try {
        await post(sessionId, 'activity', { idleSeconds: await bridge.idle() });
        const response = await fetch(`/api/sessions/${sessionId}/monitor`);
        if (!response.ok) throw new Error('Could not read analysis status.');
        const status = await response.json(); if (alive) { setMonitor(status); setConnectionError(''); }
      } catch (error) { if (alive) setConnectionError('Monitoring connection: ' + error.message + ' Retrying automatically.'); }
      finally { polling = false; }
    }
    void refresh(); const timer = setInterval(refresh, 1000);
    queueMicrotask(() => { if (alive) void start(); });
    return () => {
      alive = false; clearInterval(timer); unsubscribe(); generation.current++; release();
      setRunning(false); setStarting(false);
      void bridge.stop().catch(() => {});
      void post(sessionId, 'monitor', { enabled: false }).catch(() => {});
    };
  }, [sessionId, enabled]);
  async function toggleVoice(value) {
    setVoice(value);
    if (running) try { await post(sessionId, 'monitor', { enabled: true, voice: value }); } catch (error) { setHint(error.message); }
  }
  async function toggleExpressionResponses(value) {
    const resume = running;
    setChangingExpressions(true);
    expressionPreference.current = value; setExpressionResponses(value);
    try { localStorage.setItem('companion.expressionResponses', String(value)); } catch {}
    setExpressionCue(null); handlers.current.onResponseCue?.(null);
    try {
      if (resume) { await stop(); await start(value); }
    } catch (error) { setHint('Could not update expression responses. ' + error.message); }
    finally { setChangingExpressions(false); }
  }
  if(!enabled)return null;
  const decision = monitor?.decisions?.at(-1);
  return <section className="camera-checkin" aria-label="Continuous monitoring">
    <div className="camera-heading"><span className="eyebrow">LIVE MONITORING</span><span>{running ? 'Camera on' : 'Camera off'}</span></div>
    <video ref={video} muted playsInline hidden={!running && !starting} aria-label="Camera preview"/>
    {running && cameraInfo && <small className="camera-diagnostics">Full frame · {cameraInfo.width} × {cameraInfo.height}{cameraInfo.fps !== null ? ` · ${cameraInfo.fps} fps sent` : ''}</small>}
    <p role="status">{!bridge ? 'Camera monitoring is available in the desktop app.' : !enabled ? 'Start a session to begin continuous monitoring.' : hint}</p>
    {enabled&&<Attention video={video} sessionId={sessionId} running={running}/>}
    {enabled&&<div className="camera-actions">{running || starting
      ? <button type="button" onClick={() => { setHint('Camera and automatic analysis paused.'); void stop(); }}>Pause monitoring</button>
      : <button type="button" disabled={!bridge || !enabled || changingExpressions} onClick={()=>void start()}>Resume monitoring</button>}
      <span>Check-ins with Acumen</span></div>}
    <details className="expression-options diagnostic-details"><summary>Expression-aware responses</summary>
      <label><input type="checkbox" checked={expressionResponses} disabled={!bridge || starting || changingExpressions} onChange={event=>void toggleExpressionResponses(event.target.checked)}/> Adapt Acumen’s tone with facial expressions</label>
      <p>Optional. Changing this restarts camera analysis. A sustained expression estimate can adjust the greeting and reply style; your words always come first.</p>
      {expressionResponses && <p role="status">{changingExpressions ? 'Updating camera analysis…' : !running ? 'Paused · Normal response style' : expressionCue && Date.now() - expressionCue.observedAt <= 5000 ? `${expressionCue.tone === 'gentle' ? 'Gentle' : expressionCue.tone === 'upbeat' ? 'Upbeat' : 'Normal'} response style · Recent facial cue` : 'No reliable expression cue · Normal response style'}</p>}
      <p>Expression scores stay out of saved sessions and work memory. Only the response style accompanies a chat request to Gemini. Expressions can be misread; they do not establish emotion or stress. Availability depends on your Presage subscription.</p>
    </details>
    {enabled && <div className="monitor-status">
      <p>{monitor?.error || labels[monitor?.status] || 'Preparing automatic analysis…'}</p>
      {monitor?.waitReason && <p>{monitor.waitReason}</p>}
      {connectionError && <p role="alert">{connectionError}</p>}
      {logError && <p role="alert">{logError}</p>}
      <details className="diagnostic-details"><summary>Analysis details</summary><p>Returned readings are available in the Log tab.</p>
      <span>Gemini analyses: {monitor?.calls ?? 0} / {monitor?.budget ?? 6}</span>
      {monitor?.analysis && <span> · Local analysis: {monitor.analysis.validSampleCount} reliable samples / last 60s</span>}
      {decision && <p>{decision.delivered ? 'Suggestion delivered' : 'No interruption'} · {decision.reason}</p>}
      </details>
      {monitor?.audio?.audio && <audio ref={audio} key={monitor.audio.interventionId} controls autoPlay={voice && running} src={monitor.audio.audio} aria-label="Companion suggestion"/>}
      {monitor?.audio?.audioError && <p>{monitor.audio.audioError}</p>}
    </div>}
  </section>;
}
