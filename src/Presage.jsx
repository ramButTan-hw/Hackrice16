import { useEffect, useRef, useState } from 'react';
const bridge = window.presage;
async function post(id, endpoint, body) {
  const response = await fetch(`/api/sessions/${id}/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Monitoring connection failed.');
  return data;
}
const labels = { calibrating: 'Establishing a reliable baseline…', waiting_signal: 'Waiting for fresh readings…', analyzing_matlab: 'MATLAB is analyzing the latest window…', analyzing_gemini: 'Gemini is reviewing the combined signals…', watching: 'Watching for a useful moment to help', budget_reached: 'Analysis budget reached. Monitoring continues.', paused: 'Analysis paused', error: 'Analysis needs attention' };
export default function Presage({ sessionId, enabled, onSample, onRunning }) {
  const [running, setRunning] = useState(false), [starting, setStarting] = useState(false);
  const [voice, setVoice] = useState(false), [monitor, setMonitor] = useState(null);
  const [hint, setHint] = useState('Camera off. Monitoring starts with your session.');
  const video = useRef(null), stream = useRef(null), loop = useRef(null);
  const audio = useRef(null);
  const generation = useRef(0), pending = useRef(false), capturing = useRef(false);
  const handlers = useRef({ onSample, onRunning }); handlers.current = { onSample, onRunning };
  useEffect(() => { if (!voice || !running) audio.current?.pause(); }, [voice, running]);
  useEffect(() => { setMonitor(null); }, [sessionId]);
  function release() {
    capturing.current = false; clearTimeout(loop.current);
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    handlers.current.onRunning?.(false);
  }
  async function stop() {
    generation.current++; release(); setRunning(false); setStarting(false);
    await Promise.allSettled([bridge?.stop(), sessionId ? post(sessionId, 'monitor', { enabled: false }) : Promise.resolve()]);
  }
  async function start() {
    if (capturing.current || !enabled || !bridge) return;
    capturing.current = true;
    const version = ++generation.current;
    setStarting(true); setHint('Opening camera…');
    try {
      const capture = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 640, max: 1280 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 30, max: 30 } } });
      if (version !== generation.current) { capture.getTracks().forEach(track => track.stop()); return; }
      stream.current = capture; video.current.srcObject = capture;
      await video.current.play();
      if (version !== generation.current) return;
      await bridge.start();
      if (version !== generation.current) { await bridge.stop(); return; }
      await post(sessionId, 'monitor', { enabled: true, voice });
      if (version !== generation.current) { await post(sessionId, 'monitor', { enabled: false }); return; }
      setRunning(true); handlers.current.onRunning?.(true);
      setHint('Keep your face and chest in view. Monitoring continues across tabs.');
      const canvas = document.createElement('canvas');
      canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      async function frame() {
        if (version !== generation.current) return;
        const began = performance.now();
        try {
          if (video.current?.readyState >= 2) {
            context.drawImage(video.current, 0, 0, canvas.width, canvas.height);
            await bridge.frame({ data: context.getImageData(0, 0, canvas.width, canvas.height).data.buffer, width: canvas.width, height: canvas.height });
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
    const unsubscribe = bridge.subscribe(event => {
      if (event.type === 'validation') setHint(event.hint || 'Hold still with your face and chest in view.');
      if (event.type === 'error') { setHint(event.message); void stop(); }
      if (event.type === 'stopped') {
        generation.current++; release(); setRunning(false); setStarting(false);
        void post(sessionId, 'monitor', { enabled: false }).catch(() => {});
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
        const status = await response.json(); if (alive) setMonitor(status);
      } catch (error) { if (alive) setHint(error.message); }
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
  const decision = monitor?.decisions?.at(-1);
  return <section className="camera-checkin" aria-label="Continuous monitoring">
    <div className="camera-heading"><span className="eyebrow">LIVE MONITORING</span><span>{running ? 'Camera on' : 'Camera off'}</span></div>
    <video ref={video} muted playsInline hidden={!running && !starting} aria-label="Camera preview"/>
    <p role="status">{!bridge ? 'Camera monitoring is available in the desktop app.' : !enabled ? 'Start a session to begin continuous monitoring.' : hint}</p>
    <div className="camera-actions">{running || starting
      ? <button type="button" onClick={() => { setHint('Camera and automatic analysis paused.'); void stop(); }}>Pause monitoring</button>
      : <button type="button" disabled={!bridge || !enabled} onClick={start}>Resume monitoring</button>}
      <label><input type="checkbox" checked={voice} onChange={event => void toggleVoice(event.target.checked)}/> Speak suggestions</label></div>
    {enabled && <div className="monitor-status">
      <p>{monitor?.error || labels[monitor?.status] || 'Preparing automatic analysis…'}</p>
      <span>Gemini analyses: {monitor?.calls ?? 0} / {monitor?.budget ?? 6}</span>
      {monitor?.matlab && <span> · MATLAB: {monitor.matlab.validSampleCount} reliable samples / last 60s</span>}
      {decision && <p>{decision.delivered ? 'Suggestion delivered' : 'No interruption'} · {decision.reason}</p>}
      {monitor?.audio?.audio && <audio ref={audio} key={monitor.audio.interventionId} controls autoPlay={voice && running} src={monitor.audio.audio} aria-label="Companion suggestion"/>}
      {monitor?.audio?.audioError && <p>{monitor.audio.audioError}</p>}
    </div>}
  </section>;
}
