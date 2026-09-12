import { useEffect, useRef, useState } from 'react';

const bridge = window.presage;
export default function Presage({ sessionId, enabled, onSample }) {
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const [nextAllowedAt, setNextAllowedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [hint, setHint] = useState('Camera off. Take a short check-in when you need one.');
  const video = useRef(null);
  const stream = useRef(null);
  const loop = useRef(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const sampleHandler = useRef(onSample);
  sampleHandler.current = onSample;
  function releaseCamera() {
    clearTimeout(loop.current);
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  async function stop() {
    generation.current++;
    releaseCamera(); setRunning(false); setStarting(false);
    try { await bridge?.stop(); }
    catch { setHint('Camera off. Restart the desktop app before another reading.'); }
  }
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    bridge?.status().then(status => setNextAllowedAt(status.nextAllowedAt)).catch(() => {});
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!bridge || !enabled) return;
    let alive = true;
    const unsubscribe = bridge.subscribe(event => {
      if (event.type === 'validation') setHint(event.hint || 'Hold still with your face and chest in view.');
      if (event.type === 'error') { setHint(event.message); void stop(); }
      if (event.type === 'stopped') {
        generation.current++;
        releaseCamera(); setRunning(false); setStarting(false); setNextAllowedAt(event.nextAllowedAt);
        setHint(previous => previous.includes('could not') ? previous : 'Camera off. Check-in finished; saved readings appear below.');
      }
      if (event.type === 'sample' && !pending.current) {
        pending.current = true;
        fetch(`/api/sessions/${sessionId}/metrics`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event.sample),
        }).then(async response => {
          if (!response.ok) throw new Error('Could not save the camera reading.');
          const data = await response.json();
          if (alive) sampleHandler.current(data);
        }).catch(error => { if (alive) { setHint(error.message); void stop(); } })
          .finally(() => { pending.current = false; });
      }
    });
    return () => {
      alive = false; unsubscribe(); generation.current++; releaseCamera();
      setRunning(false); setStarting(false);
      void bridge.stop().catch(() => {});
    };
  }, [sessionId, enabled]);
  useEffect(() => {
    if (running && now >= deadline) void stop();
  }, [running, now, deadline]);
  async function start() {
    if (starting || running || !enabled || Date.now() < nextAllowedAt) return;
    const version = ++generation.current;
    setStarting(true); setHint('Opening camera…');
    try {
      const capture = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        width: { ideal: 640, max: 1280 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 30, max: 30 },
      } });
      if (version !== generation.current) { capture.getTracks().forEach(track => track.stop()); return; }
      stream.current = capture; video.current.srcObject = capture;
      await video.current.play();
      if (version !== generation.current) return;
      const status = await bridge.start();
      if (version !== generation.current) { await bridge.stop(); return; }
      setDeadline(status.deadline); setNextAllowedAt(status.nextAllowedAt); setRunning(true);
      setHint('Hold still with your face and chest in view.');
      const canvas = document.createElement('canvas');
      canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      async function frame() {
        if (version !== generation.current || Date.now() >= status.deadline) return;
        const began = performance.now();
        try {
          if (video.current?.readyState >= 2) {
            context.drawImage(video.current, 0, 0, canvas.width, canvas.height);
            await bridge.frame({ data: context.getImageData(0, 0, canvas.width, canvas.height).data.buffer, width: canvas.width, height: canvas.height });
          }
          if (version === generation.current) loop.current = setTimeout(frame, Math.max(0, 1000 / 30 - (performance.now() - began)));
        } catch { setHint('Camera processing stopped. Try again after the cooldown.'); void stop(); }
      }
      void frame();
    } catch (error) {
      if (version === generation.current) { setHint(error.message); await stop(); }
    } finally { if (version === generation.current) setStarting(false); }
  }
  const cooldown = Math.max(0, Math.ceil((nextAllowedAt - now) / 1000));
  return <section className="camera-checkin" aria-label="Camera check-in">
    <div className="camera-heading"><span className="eyebrow">CAMERA CHECK-IN</span><span>{running ? `${Math.max(0, Math.ceil((deadline - now) / 1000))}s left` : 'On demand'}</span></div>
    <video ref={video} muted playsInline hidden={!running && !starting} aria-label="Camera preview"/>
    <p role="status">{!bridge ? 'Camera check-ins are available in the desktop app.' : !enabled ? 'Start a session to take a camera check-in.' : hint}</p>
    <div className="camera-actions">{running || starting
      ? <button type="button" onClick={() => { setHint('Camera off. Reading canceled.'); void stop(); }}>Stop camera</button>
      : <button type="button" disabled={!bridge || !enabled || cooldown > 0} onClick={start}>{cooldown > 0 ? `Available in ${Math.floor(cooldown / 60)}:${String(cooldown % 60).padStart(2, '0')}` : 'Take 30s reading'}</button>}
      <span>Chat runs only when you send.</span></div>
  </section>;
}
