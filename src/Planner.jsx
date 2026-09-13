import React, { useEffect, useRef, useState } from 'react';
import './insights.css';
import './planner.css';
import {dateInput,monthDays,plansOnDay} from './planner-calendar.js';
import { openGoogle } from './GoogleActions.jsx';
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const time = n => new Date(n).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export default function Planner({ api }) {
  const [month,setMonth]=useState(dateInput().slice(0,7));
  const previousGoogle = useRef(null);
  const [google, setGoogle] = useState(null), [useGoogle, setUseGoogle] = useState(false);
  const [patterns, setPatterns] = useState(null), [plans, setPlans] = useState([]);
  const [patternsLoading,setPatternsLoading]=useState(true),[patternsError,setPatternsError]=useState(''),[patternsAttempt,setPatternsAttempt]=useState(0);
  const [plansLoading,setPlansLoading]=useState(true),[plansError,setPlansError]=useState(''),[plansAttempt,setPlansAttempt]=useState(0);
  const [date, setDate] = useState(dateInput()), [title, setTitle] = useState('Focus time');
  const [duration, setDuration] = useState(60), [from, setFrom] = useState('09:00'), [until, setUntil] = useState('18:00');
  const [slots, setSlots] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => {
    let cancelled = false;
    setPatternsLoading(true);setPatternsError('');
    api('/analytics/patterns?timeZone=' + encodeURIComponent(timeZone)).then(p=>{if(!cancelled)setPatterns(p);}).catch(e=>{if(!cancelled)setPatternsError(e.message);}).finally(()=>{if(!cancelled)setPatternsLoading(false);});
    return () => { cancelled = true; };
  }, [api,patternsAttempt]);
  useEffect(() => {
    let cancelled = false;
    setPlansLoading(true);setPlansError('');
    api('/plans').then(rows=>{if(!cancelled)setPlans(rows);}).catch(e=>{if(!cancelled)setPlansError(e.message);}).finally(()=>{if(!cancelled)setPlansLoading(false);});
    return () => { cancelled = true; };
  }, [api,plansAttempt]);
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try { const status = await api('/google/status'); if (!cancelled) {
        const previous = previousGoogle.current;
        if (previous?.connected !== status.connected || previous?.email !== status.email) { setUseGoogle(status.connected); setSlots(null); }
        previousGoogle.current = status; setGoogle(status);
      } } catch (e) { if (!cancelled) setError(e.message); }
    }
    void refresh(); const timer = setInterval(refresh, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  async function connect() {
    setBusy(true); setError('');
    try { const result = await api('/google/connect', {}); await openGoogle(result.url); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function publish(plan) {
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await api('/plans/' + plan.id + '/google', {});
      setPlans(previous => previous.map(p => p.id === updated.id ? updated : p));
      setSlots(null); setNotice('Added to Google Calendar · Acumen work sessions.');
    } catch (e) { setError(e.message + ' Your Acumen plan is saved. Retrying uses the same Google event ID.'); }
    finally { setBusy(false); }
  }
  async function suggest(e) {
    e.preventDefault(); setBusy(true); setError(''); setNotice(''); setSlots(null);
    try { setSlots(await api('/plans/suggest', { start: new Date(`${date}T${from}`).getTime(), end: new Date(`${date}T${until}`).getTime(), durationMinutes: Number(duration), timeZone, useGoogle })); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function save(slot) {
    setBusy(true); setError('');
    try { const plan = await api('/plans', { title, start: slot.start, end: slot.end, timeZone }); setPlans(previous => [...previous, plan].sort((a, b) => a.start - b.start)); setSlots(null); setNotice('Saved to your Acumen schedule.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function remove(id) {
    setBusy(true); setError('');
    try { const response = await fetch('/api/plans/' + encodeURIComponent(id), { method: 'DELETE' }); if (!response.ok) throw new Error('Could not remove this plan.'); setPlans(previous => previous.filter(p => p.id !== id)); setSlots(null); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function selectDay(day){setDate(day);setSlots(null);setNotice('');}
  function moveMonth(delta){const d=new Date(month+'-01T12:00:00');d.setMonth(d.getMonth()+delta);setMonth(dateInput(d).slice(0,7));}
  const dayPlans=plansOnDay(plans,date);
  const selectedLabel=new Date(date+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
  const knownHours=patterns?.hours.filter(h=>h.score!==null).length??0;
  return <section className="planner calendar-planner" aria-label="Schedule planner">
    <header className="planner-heading"><div><h1>Plan your day.</h1><p>Pick a task. Make a little room to focus.</p></div><button className="google-status-button" disabled={busy||!google?.configured} onClick={connect}><span className={google?.connected?'connection-dot connected':'connection-dot'}/>{google?.connected?'Google connected':google?.configured?'Connect Google':'Google not configured'}</button></header>
    {notice&&<p className="planner-notice" role="status">✓ {notice}</p>}{error&&<p className="error" role="alert">{error}</p>}
    <div className="planner-layout"><div className="planner-primary">
      <section className="month-card" aria-label="Monthly calendar">
        <header className="month-toolbar"><h2>{new Date(month+'-01T12:00:00').toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2><div><button disabled={busy} onClick={()=>{setMonth(dateInput().slice(0,7));selectDay(dateInput());}}>Today</button><button disabled={busy} aria-label="Previous month" onClick={()=>moveMonth(-1)}>‹</button><button disabled={busy} aria-label="Next month" onClick={()=>moveMonth(1)}>›</button></div></header>
        <div className="weekdays" aria-hidden="true">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><span key={d}>{d}</span>)}</div>
        <div className="month-grid">{monthDays(month).map(day=>{const items=plansOnDay(plans,day);return <button key={day} disabled={busy} className={'calendar-day '+(day.slice(0,7)!==month?'outside-month ':'')+(day===date?'selected-day ':'')+(day===dateInput()?'today-day':'')} aria-pressed={day===date} aria-label={`${new Date(day+'T12:00:00').toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})}, ${items.length} plans`} onClick={()=>selectDay(day)}><span className="day-number">{Number(day.slice(-2))}</span><span className="day-events">{items.slice(0,2).map(p=><span className="calendar-event" key={p.id}>{p.title}</span>)}{items.length>2&&<small>+{items.length-2} more</small>}</span>{items.length>0&&<span className="day-dot"/>}</button>;})}</div>
        <footer className="calendar-legend"><span><i/> Acumen work blocks</span><span>{timeZone.replaceAll('_',' ')}</span></footer>
      </section>
      <section className="day-agenda" aria-label="Selected day plans"><header><div><span className="eyebrow">YOUR DAY</span><h2>{selectedLabel}</h2></div><span className="plan-count">{plansLoading?'Loading…':plansError?'Unavailable':`${dayPlans.length} ${dayPlans.length===1?'block':'blocks'}`}</span></header>
      {plansLoading?<p role="status">Loading your saved work blocks…</p>:plansError?<div role="alert"><p>Could not load your saved work blocks. {plansError}</p><button type="button" onClick={()=>setPlansAttempt(n=>n+1)}>Retry work blocks</button></div>:!dayPlans.length?<div className="agenda-empty"><span aria-hidden="true">◷</span><div><h3>A little breathing room.</h3><p>No work blocks yet. Pick a task and find a time that fits.</p></div></div>:dayPlans.map(plan=><article className="agenda-item" key={plan.id}><div className="agenda-time"><strong>{time(plan.start)}</strong><span>{time(plan.end)}</span></div><div className="agenda-info"><h3>{plan.title}</h3><p>{Math.round((plan.end-plan.start)/60000)} min · {plan.google?'Added to Google':'Acumen plan'}</p><div className="agenda-actions">{plan.google?<button onClick={()=>void openGoogle(plan.google.url).catch(e=>setError(e.message))}>Open in Google ↗</button>:<button disabled={busy||!google?.connected||plan.end<=Date.now()} onClick={()=>publish(plan)}>Add to Google</button>}<button disabled={busy} onClick={()=>remove(plan.id)}>{plan.google?'Remove from Acumen only':'Remove'}</button></div></div></article>)}
      </section>
    </div><aside className="planner-sidebar" aria-label="Plan a work block">
      <section className="block-composer"><span className="eyebrow">WORKING ON</span><h2>Make time for it.</h2><p className="composer-date">{selectedLabel}</p>
        <form className="planner-form" onSubmit={suggest} onChange={()=>setSlots(null)}><fieldset disabled={busy||plansLoading||Boolean(plansError)}><label>What are you working on?<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={200} required placeholder="e.g. Review lecture notes"/></label><label className="duration-label">Duration<select value={duration} onChange={e=>setDuration(Number(e.target.value))}>{[15,30,45,60,90,120,180,240].map(m=><option key={m} value={m}>{m} minutes</option>)}</select></label><div className="planner-fields"><label>From<input type="time" value={from} onChange={e=>setFrom(e.target.value)} required/></label><label>Until<input type="time" value={until} onChange={e=>setUntil(e.target.value)} required/></label></div><button className="find-times" disabled={busy||!title.trim()||date<dateInput()}>{busy?'Working…':'Find a time'} <span aria-hidden="true">→</span></button></fieldset></form>
        <p className="composer-note">{plansLoading?'Loading your schedule before finding times…':plansError?'Retry loading your saved work blocks to find a time.':date<dateInput()?'Select today or a future day to plan.':'Suggestions leave 15 minutes between work blocks.'}</p>
        {slots&&<div className="suggested-slots"><h3>{slots.length?'Available moments':'No room in this window'}</h3>{!slots.length&&<p>Try a shorter block or a wider time range.</p>}{slots.map(slot=><button className="suggested-slot" key={slot.start} disabled={busy} onClick={()=>save(slot)}><span><strong>{time(slot.start)} – {time(slot.end)}</strong><small>{slot.score===null?'Availability only · more history needed':`${slot.score}% historical elevation · ${slot.confidence} confidence`}</small></span><span aria-hidden="true">＋</span><span className="sr-only">Save block</span></button>)}</div>}
      </section>
      <section className="rhythm-summary"><span className="eyebrow">LEARNING YOUR RHYTHM</span><h3>{knownHours?'Your patterns are taking shape.':'Every session adds perspective.'}</h3>{patternsLoading?<p role="status">Loading your session history…</p>:patternsError?<div role="alert"><p>Could not load your signal patterns. {patternsError}</p><button type="button" onClick={()=>setPatternsAttempt(n=>n+1)}>Retry signal patterns</button></div>:<><p>{patterns?.sessionCount} completed sessions · {knownHours} hours with enough history</p><details><summary>View signal patterns</summary><div className="hour-grid">{patterns?.hours.map(h=><div key={h.hour} className={h.score===null?'unknown':h.score>=40?'elevated':'steady'} title={`${h.hour}:00 · ${h.dayCount} days · ${Math.round(h.observedSeconds/60)} minutes`}><span>{String(h.hour).padStart(2,'0')}</span><strong>{h.score===null?'—':`${h.score}%`}</strong></div>)}</div><p>Each hour needs 10 recorded minutes across 3 sessions on 3 days. Percentages show elevated-signal time, not stress probability. Demo data is excluded.</p></details></>}</section>
      <details className="calendar-settings"><summary>Calendar connection <span>{google?.connected?'Connected':'Not connected'}</span></summary><p>{google?.email??'Connect Google to check availability and publish blocks.'}</p>{google?.connected&&<label className="calendar-toggle"><input type="checkbox" checked={useGoogle} disabled={busy} onChange={e=>{setUseGoogle(e.target.checked);setSlots(null);}}/> Check Google busy times</label>}<p>Availability checks cover your primary and Acumen calendars. The calendar above shows saved Acumen blocks only. Google edits are managed in Google.</p><button disabled={busy||!google?.configured} onClick={connect}>{google?.connected?'Reconnect Google':'Connect Google'}</button></details>
    </aside></div><p className="planner-bottom-note">Patterns offer context, not a prediction of how you’ll feel. Biometric data is never included in Google Calendar events.</p>
  </section>;
}
