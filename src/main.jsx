import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import './ui-polish.css';
import DevicePermissions from './DevicePermissions.jsx';
import Chat from './Chat.jsx';
import Presage from './Presage.jsx';
import DemoCamera from './DemoCamera.jsx';
import EventLog from './EventLog.jsx';
import Assistance from './Assistance.jsx';
import HelpWindow from './HelpWindow.jsx';
import { ThemePicker, useTheme, AppearanceWindow } from './themes.jsx';

const desktop = window.companionWindow;
const icons = {
  collapse: <><path d="m9 4 4 4-4 4M4 8h9"/><path d="M4 3v10"/></>,
  expand: <><path d="m7 4-4 4 4 4M3 8h9"/><path d="M12 3v10"/></>,
  play: <path d="m6 3 7 5-7 5Z"/>,
  stop: <rect x="4" y="4" width="8" height="8" rx="2"/>,
  heart: <path d="M8 13S1 9 2 5c1-3 5-3 6 0 1-3 5-3 6 0 1 4-6 8-6 8Z"/>,
  wind: <><path d="M2 5h8c4 0 3-5 0-3M2 8h11M2 11h7c4 0 3 5 0 3"/></>,
  chevron: <path d="m5 6 3 3 3-3"/>,
  pin: <><path d="m5 2 6 0-1 5 3 3H3l3-3Z"/><path d="M8 10v4"/></>,
  close: <path d="m4 4 8 8M12 4l-8 8"/>,
  minus: <path d="M3 8h10"/>,
  arrow: <path d="M3 8h10m-4-4 4 4-4 4"/>,
};
function Icon({ name, ...props }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{icons[name]}</svg>;
}
async function api(path, body) {
  const response = await fetch('/api' + path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(problem.error || 'Unable to connect. Please try again.');
  }
  return response.json();
}
function readSaved() {
  try { return localStorage.getItem('still.session'); } catch { return null; }
}
function remember(id) {
  try { id ? localStorage.setItem('still.session', id) : localStorage.removeItem('still.session'); } catch {}
}
function elapsed(session, now) {
  const seconds = session ? Math.max(0, Math.floor(((session.endedAt ?? now) - session.startedAt) / 1000)) : 0;
  return [Math.floor(seconds / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
}

function App() {
  const [appearance, setAppearance] = useTheme();
  const [compact, setCompact] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [tab, setTab] = useState('session');
  const [goal, setGoal] = useState('');
  const [session, setSession] = useState(null);
  const [state, setState] = useState(null);
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const epoch = useRef(0);
  const collapseButton = useRef(null);
  const active = session?.status === 'active';
  const time = elapsed(session, now);
  useEffect(()=>{void desktop?.setSession?.(active?session.id:null).catch(error=>setError(error.message));},[active,session?.id]);

  useEffect(() => {
    document.documentElement.classList.toggle('desktop', Boolean(desktop));
    const id = readSaved();
    if (id) api('/sessions/' + id).then(data => {
      setSession(data); setGoal(data.goal);
      if (data.status !== 'active') remember(null);
    }).catch(() => remember(null));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      const version = epoch.current;
      try {
        const [next, workState] = await Promise.all([api('/sessions/' + session.id), api('/sessions/' + session.id + '/state')]);
        if (!stopped && version === epoch.current) { setSession(next); setState(workState); }
      } catch (error) { if (!stopped) setError(error.message); }
      finally { pending = false; }
    }
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [active, session?.id]);

  useEffect(() => {
    if (tab !== 'history') return;
    let stopped = false;
    api('/sessions').then(rows => { if (!stopped) setHistory(rows); })
      .catch(error => { if (!stopped) setError(error.message); });
    return () => { stopped = true; };
  }, [tab]);

  async function toggleCompact() {
    const next = !compact;
    try {
      if (desktop) await desktop.setCompact(next);
      setCompact(next);
      requestAnimationFrame(() => collapseButton.current?.focus());
    } catch { setError('Could not resize the window. Try again.'); }
  }
  async function togglePin() {
    try { await desktop.setPinned(!pinned); setPinned(!pinned); }
    catch { setError('Could not update the window.'); }
  }
  async function start(event) {
    event.preventDefault();
    if (busy || !goal.trim()) return;
    setBusy(true); setError(''); epoch.current++;
    try {
      const data = await api('/sessions', { goal: goal.trim(), source: 'presage' });
      setSession(data); setSummary(null); setState(null); remember(data.id);
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  async function startDemo() {
    if(busy||active||!goal.trim())return;
    setBusy(true);setError('');epoch.current++;
    try {
      const data=await api('/sessions',{goal:goal.trim(),source:'demo',demoScenario:'sustained_pulse'});
      setSession(data);setSummary(null);setState(null);remember(data.id);
    }catch(error){setError(error.message);}finally{setBusy(false);}
  }
  async function end() {
    if (busy || !active) return;
    setBusy(true); setError(''); epoch.current++;
    try {
      const data = await api('/sessions/' + session.id + '/end', {});
      setSession(data); remember(null);
      void window.helpBridge?.session(null).catch(()=>{});
      void window.presage?.stop().catch(()=>{});
      setSummary(await api('/sessions/' + data.id + '/summary'));
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  async function openHistory(item) {
    setBusy(true); setError(''); epoch.current++;
    try {
      const [data, stats] = await Promise.all([api('/sessions/' + item.id), api('/sessions/' + item.id + '/summary')]);
      setSession(data); setSummary(stats); setGoal(data.goal); setTab('session');
      if (data.status === 'active') remember(data.id);
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  const last = session?.samples?.at(-1);
  const fresh = last && (session.endedAt ?? now) - last.timestamp <= 10000 && last.quality >= 0.7;
  const message = session?.interventions?.at(-1);
  const status = active ? 'In progress' : session ? 'Completed' : 'Ready';

  return (
    <div className={'stage ' + (compact ? 'is-compact' : '')}>
      <main className={'glass-shell ' + (compact ? 'compact' : '')} aria-label="Session panel">
        {compact && (
          <div className="compact-bar">
            <div className="compact-identity drag"><div><strong>{time}</strong><span>{active ? (session.source==='demo'?'SIMULATED · ':monitoring ? 'Camera on · ' : '') + session.goal : status}</span></div></div>
            {active && <button className="icon-button" aria-label="End session" disabled={busy} onClick={end}><Icon name="stop"/></button>}
            <button ref={collapseButton} className="icon-button" aria-label="Expand companion" aria-expanded="false" onClick={toggleCompact}><Icon name="expand"/></button>
          </div>
        )}<div className="expanded-panel" hidden={compact}>
            <header className="topbar">
              <div className="window-drag-area drag app-wordmark"><span aria-hidden="true">✦</span> Jarvis</div>
              <div className="window-actions">
                <ThemePicker settings={appearance} onChange={setAppearance}/>
                {desktop && <><button className={'icon-button ' + (pinned ? 'selected' : '')} aria-label="Keep on top" aria-pressed={pinned} title="Keep on top" onClick={togglePin}><Icon name="pin"/></button><button className="icon-button" aria-label="Minimize window" onClick={() => desktop.minimize()}><Icon name="minus"/></button></>}
                <button ref={collapseButton} className="icon-button" aria-label="Collapse companion" aria-expanded="true" title="Collapse to compact mode" onClick={toggleCompact}><Icon name="collapse"/></button>
                {desktop && <button className="icon-button" aria-label="Close window" onClick={() => desktop.close()}><Icon name="close"/></button>}
              </div>
            </header>
            <nav className="tabs" aria-label="Companion views">
              <button className={tab === 'session' ? 'current' : ''} aria-pressed={tab === 'session'} onClick={() => setTab('session')}>Session</button>
              <button className={tab === 'history' ? 'current' : ''} aria-pressed={tab === 'history'} onClick={() => setTab('history')}>History</button>
              <button className={tab === 'chat' ? 'current' : ''} aria-pressed={tab === 'chat'} onClick={() => setTab('chat')}>Chat</button>
              <button className={tab === 'log' ? 'current' : ''} aria-pressed={tab === 'log'} onClick={() => setTab('log')}>Log</button>
            </nav>
            <div className="content">
              {session?.source==='demo'&&<p className="monitor-indicator" role="status"><strong>SIMULATED BIOMETRICS</strong> · Demo session · Gemini responses are real.</p>}
              {tab !== 'session' && monitoring && <p className="monitor-indicator">Camera on · Automatic analysis running</p>}
              <div hidden={tab !== 'session'}>
                {!active&&<div className="session-intro"><span className="eyebrow">{session?'A FRESH START':'YOUR WORK COMPANION'}</span><h1>One thing at a time.</h1><p>Pick a task. I’ll be here if you need a hand.</p></div>}
                <form className={'session-card '+(!active?'session-idle':'')} onSubmit={start}>
                  <label className="eyebrow" htmlFor="intention">WORKING ON</label>
                  <input id="intention" placeholder="e.g. Review lecture notes" value={goal} onChange={event => setGoal(event.target.value)} maxLength={200} disabled={active || busy} required autoComplete="off"/>
                  <div className="timer-row"><div><div className="timer">{time}</div><span className="timer-label">{status}</span></div>
                    {active ? <button className="session-action ending" type="button" disabled={busy} onClick={end} aria-label="End session"><Icon name="stop"/></button> : <button className="session-action start-session" disabled={busy || !goal.trim()} aria-label="Start session"><Icon name="play"/><span>Start session</span></button>}</div>
                </form>
                {!active&&<button type="button" className="idle-help" onClick={()=>setTab('chat')}><span className="idle-help-icon" aria-hidden="true">✦</span><span><strong>Need a hand getting started?</strong><small>Ask Jarvis a question or summarize your screen.</small></span><Icon name="arrow"/></button>}
              <Assistance session={session} onSessionEnded={data=>{epoch.current++;setSession(data);remember(null);void window.presage?.stop().catch(()=>{});}} onReveal={()=>{setTab('session');if(compact)void toggleCompact();}}/>

                {active&&session.demoScenario&&<DemoCamera sessionId={session.id}/>}
                {active&&session.demoScenario&&<details className="camera-checkin demo-details"><summary>Pulse-rise demo <span>Simulated</span></summary><p>{now-session.startedAt<=20000?'Building a simulated baseline around 72 bpm (20 seconds).':now-session.startedAt<100000?'Pulse fluctuating around 94 bpm. Demo uses a shortened 30-second hold before review.':now-session.startedAt<=300000?'Recovery: easing back toward 72 bpm.':'Scenario complete. End the session when ready.'}</p><p>Camera preview is live. Pulse, breathing and inactivity are synthetic and stored in this separate demo session. Expect a Gemini review around one minute; Gemini can choose not to interrupt.</p><p>Gemini reviews: {session.monitor?.calls??0} / 6 · {session.monitor?.status?.replaceAll('_',' ')}</p>{session.monitor?.error&&<p role="alert">{session.monitor.error}</p>}</details>}
                {session?.source!=='demo'&&<Presage sessionId={session?.id} enabled={active} onRunning={setMonitoring} onSample={({ sample, workState }) => { setState(workState); setSession(previous => previous ? { ...previous, samples: [...previous.samples.filter(item => item.timestamp !== sample.timestamp), sample] } : previous); }}/>}
                {(active||last)&&<section className="signals" aria-label="Session readings"><div><span><Icon name="heart"/> Heart rate</span><strong>{(last?.qualityByMetric?.heartRate ?? last?.quality) >= 0.7 ? Number.isFinite(last?.heartRate) ? last.heartRate.toFixed(1) : '—' : '—'}<small>bpm</small></strong></div><div><span><Icon name="wind"/> Breathing</span><strong>{(last?.qualityByMetric?.breathingRate ?? last?.quality) >= 0.7 ? Number.isFinite(last?.breathingRate) ? last.breathingRate.toFixed(1) : '—' : '—'}<small>/ min</small></strong></div><div className="signal-note"><span>{fresh ? (session.source==='demo'?'Simulated reading':'Live reading') : last ? `Last reading · ${new Date(last.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${last.quality < 0.7 ? ' · Low signal quality' : ''}` : 'No readings yet'}</span></div></section>}
                {message && <section className="companion-note"><div><span className="eyebrow">CHECK-IN</span><p>{message.text}</p>{message.provider === 'demo' && <small>Demo check-in</small>}</div></section>}
                <DevicePermissions/>{session&&<details className="details"><summary>Session details <Icon name="chevron"/></summary><div className="detail-body"><p>{state?.reason ?? 'Readings will appear when the camera integration connects. Your timer works independently.'}</p><dl><div><dt>Samples received</dt><dd>{session?.samples?.length ?? 0}</dd></div><div><dt>Companion check-ins</dt><dd>{session?.interventions?.length ?? 0}</dd></div>{summary && <div><dt>Average heart rate</dt><dd>{summary.averageHeartRate == null ? '—' : summary.averageHeartRate.toFixed(1) + ' bpm'}</dd></div>}</dl></div></details>}
              </div>{tab === 'history' ? <section className="history"><div className="history-list">{history.length ? history.map(item => <button className="history-item" key={item.id} disabled={busy || (active && session.id !== item.id)} onClick={() => openHistory(item)}><div className="history-item-text"><strong>{item.goal}</strong><small>{new Date(item.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {item.status === 'active' ? 'In progress' : elapsed(item, now)}{item.source === 'demo' ? ' · Demo' : ''}</small></div><Icon name="arrow"/></button>) : <div className="empty-history"><p>No sessions yet.</p><button onClick={() => setTab('session')}>Start a session <Icon name="arrow"/></button></div>}</div></section> : null}
              <Chat visible={tab === 'chat'} sessionId={session?.id}/>
              <EventLog visible={tab === 'log'} sessionId={session?.id}/>
              {tab !== 'session' && message && <section className="companion-note"><div><span className="eyebrow">COMPANION</span><p>{message.text}</p></div></section>}
              {error && <div className="error" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><Icon name="close"/></button></div>}
            </div>
            {tab==='session'&&<footer className="demo-footer"><span className="footer-status"><span aria-hidden="true"/>{active?'Session active':'Monitoring off'}</span><button type="button" className="demo-launch" disabled={busy||active||!goal.trim()} onClick={startDemo} title={active?'End the current session to start a separate demo.':'Start a simulated pulse rise with live camera preview'}>Demo pulse rise</button></footer>}
          </div>
        {compact && error && <span className="compact-error" title={error} role="alert">Connection issue — expand for details</span>}
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<React.StrictMode>{new URLSearchParams(location.search).has('appearance-window')?<AppearanceWindow/>:new URLSearchParams(location.search).has('help-window')?<HelpWindow/>:<App/>}</React.StrictMode>);


