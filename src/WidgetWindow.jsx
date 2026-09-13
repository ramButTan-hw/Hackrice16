import React,{useEffect,useRef,useState} from 'react';
import {ThemePicker,useTheme} from './themes.jsx';
import {jsonResponse} from './companion-api.js';
import './widgets.css';
const format=ms=>{const seconds=Math.ceil(ms/1000);return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;};
export default function WidgetWindow({kind}){
  const [appearance,setAppearance]=useTheme();
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now()),[minutes,setMinutes]=useState(25),[draft,setDraft]=useState(''),[pinned,setPinned]=useState(true);
  const alive=useRef(true),controls=window.widgetWindow;
  const apply=value=>setData(old=>!old||value.revision>=old.revision?value:old);
  useEffect(()=>{
    alive.current=true;document.documentElement.classList.toggle('desktop',Boolean(controls));document.title='Acumen '+kind;
    let pending=false;
    async function refresh(){if(pending)return;pending=true;try{const next=await fetch('/api/widgets/'+kind).then(jsonResponse);if(alive.current)apply(next);}catch(e){if(alive.current)setError(e.message);}finally{pending=false;}}
    void refresh();const poll=setInterval(refresh,1500),tick=setInterval(()=>setNow(Date.now()),250);
    return()=>{alive.current=false;clearInterval(poll);clearInterval(tick);document.documentElement.classList.remove('desktop');};
  },[kind]);
  useEffect(()=>{if(kind==='timer'&&data?.minutes!=null)setMinutes(data.minutes);},[kind,data?.minutes]);
  async function change(body){if(busy||!data)return false;setBusy(true);setError('');try{const value=await fetch('/api/widgets/'+kind,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,revision:data.revision})}).then(jsonResponse);if(alive.current)apply(value);return true;}catch(e){if(alive.current)setError(e.message);return false;}finally{if(alive.current)setBusy(false);}}
  const remaining=data?(data.status==='running'?Math.max(0,data.endsAt-now):data.remainingMs):0;
  const completed=kind==='timer'&&data&&(data.status==='completed'||(data.status==='running'&&remaining===0));
  const running=data?.status==='running'&&!completed;
  const checked=data?.items?.filter(i=>i.done).length??0;
  return <div className="stage widget-stage"><main className={'glass-shell widget-shell '+(kind==='timer'?'compact-timer':'')} aria-label={'Acumen '+kind+' widget'}><header className="topbar"><div className="drag window-drag-area app-wordmark"><span aria-hidden="true">✦</span>Acumen <small>{kind==='timer'?'Timer':'Checklist'}</small></div><div className="window-actions">{kind!=='timer'&&<ThemePicker settings={appearance} onChange={setAppearance}/>}{controls&&<><button className={'icon-button '+(pinned?'selected':'')} aria-label="Keep widget on top" aria-pressed={pinned} onClick={async()=>{try{await controls.pinned(!pinned);setPinned(!pinned);}catch(e){setError(e.message);}}}>⌖</button>{kind!=='timer'&&<button className="icon-button" aria-label="Minimize widget" onClick={()=>controls.minimize()}>−</button>}<button className="icon-button" aria-label="Close widget" onClick={()=>controls.close()}>×</button></>}</div></header>
    <div className="content widget-content">{!data?<p role="status">Loading your {kind}…</p>:kind==='timer'?<>
      <div className="compact-timer-face"><h1>{data.status==='idle'?'Focus time':data.title}</h1><span className="widget-countdown" role="timer" aria-label="Time remaining">{data.status==='idle'?format(Number(minutes)*60000||0):format(remaining)}</span><span className="timer-caption" role="status">{completed?'Complete':running?(data.title==='Short break'?'On a break':'Focusing'):data.status==='paused'?'Paused':'Ready'}</span></div>
      <progress className="timer-progress" aria-label="Timer progress" max={data.minutes*60000} value={data.status==='idle'?0:Math.max(0,data.minutes*60000-remaining)}/>
      {data.status==='idle'&&<label className="compact-duration">Minutes<input type="number" min="1" max="240" value={minutes} disabled={busy} onChange={e=>setMinutes(e.target.value===''?'':Number(e.target.value))}/></label>}
      <div className="widget-actions">{running?<button className="widget-primary" disabled={busy} onClick={()=>change({action:'pause'})}>Pause</button>:data.status==='paused'?<button className="widget-primary" disabled={busy} onClick={()=>change({action:'resume'})}>Resume</button>:<button className="widget-primary" disabled={busy||!Number.isInteger(minutes)||minutes<1||minutes>240} onClick={()=>change({action:'start',minutes,title:'Focus time'})}>{completed?'Start again':'Start'}</button>}{data.status!=='idle'&&<button disabled={busy} onClick={()=>change(completed?{action:'start',minutes:5,title:'Short break'}:{action:'reset'})}>{completed?'5m break':'Reset'}</button>}</div>
    </>:<>
      <div className="widget-intro"><h1>{data.title}</h1><p>{data.items.length?`${checked} of ${data.items.length} complete. One step at a time.`:'Small steps make a good start.'}</p></div>
      {data.items.length>0&&<progress className="checklist-progress" max={data.items.length} value={checked} aria-label="Checklist completion"/>}
      <form className="widget-add" onSubmit={async e=>{e.preventDefault();if(await change({action:'add',text:draft}))setDraft('');}}><input aria-label="New checklist item" placeholder="Add a small next step…" value={draft} maxLength={300} disabled={busy} onChange={e=>setDraft(e.target.value)}/><button className="widget-primary" disabled={busy||!draft.trim()} aria-label="Add item">＋</button></form>
      <ul className="widget-checklist">{data.items.map(item=><li key={item.id} className={item.done?'is-done':''}><label><input type="checkbox" checked={item.done} disabled={busy} onChange={e=>change({action:'toggle',id:item.id,done:e.target.checked})}/><span>{item.text}</span></label><button className="icon-button" aria-label={'Remove '+item.text} disabled={busy} onClick={()=>change({action:'remove',id:item.id})}>×</button></li>)}</ul>
      {!data.items.length&&<div className="widget-empty"><span aria-hidden="true">☑</span><p>Add your first step, or ask Acumen<br/>to make a checklist for a task.</p></div>}
      <p className="widget-note">Saved automatically. Close and reopen whenever you need it.</p>
    </>}{error&&<p className="error" role="alert">{error}</p>}</div></main></div>;
}
