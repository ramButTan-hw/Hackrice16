import {endForBreak,BREAK_REPLY} from './break-request.js';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useWake} from './use-wake.js';
import CompanionChat from './CompanionChat.jsx';
import {jsonResponse} from './companion-api.js';
const bridge=window.helpBridge;
async function api(id,answer){return fetch('/api/sessions/'+id+'/assistance',answer?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answer,actionId:crypto.randomUUID()})}:{}).then(jsonResponse);}
export default function Assistance({session,onSessionEnded=()=>{}}){
  const id=session?.id,active=session?.status==='active';
  const [dismissedBreak,setDismissedBreak]=useState(null);
  const available=active||(session?.endReason==='break'&&dismissedBreak!==id);
  const activeRef=useRef(active);activeRef.current=active;
  const [data,setData]=useState({}),[open,setOpen]=useState(false),[text,setText]=useState(''),[error,setError]=useState(''),[now,setNow]=useState(Date.now());
  const seen=useRef(null),callbacks=useRef({});callbacks.current={begin,answer};
  const [ready,setReady]=useState(false),[listening,setListening]=useState(false),[listenId,setListenId]=useState(0),[wake,setWake]=useState(()=>localStorage.getItem('companion.handsfree')!=='false');
  useEffect(()=>{window.dispatchEvent(new CustomEvent('attention-pause',{detail:open}));return()=>window.dispatchEvent(new CustomEvent('attention-pause',{detail:false}));},[open]);
  const onWake=useCallback(()=>callbacks.current.begin(),[]);
  const wakeStatus=useWake(bridge,available&&ready&&wake&&!listening,onWake);
  function begin(checkin=''){setText(checkin);setOpen(true);setListening(true);setListenId(n=>n+1);}
  async function answer(value){
    if(value==='listening'){setListening(true);return;}if(value==='idle'){setListening(false);return;}
    if(value==='close'){setOpen(false);setListening(false);if(!active){setDismissedBreak(id);return;}}
    if(value==='break_start'){try{const ended=await endForBreak(id);onSessionEnded(ended);if(!open)begin(BREAK_REPLY);}catch(e){setError(e.message);}return;}
    if(!active)return;
    try{const next=await api(id,value);setData(next);if(['fine'].includes(value)){setOpen(false);setListening(false);}}catch(e){setError(e.message);}
  }
  useEffect(()=>{
    setOpen(false);seen.current=null;setData(session?.assistance??{});if(!available)return;
    let alive=true,pending=false;
    setReady(false);setListening(false);
    void bridge?.session(id).then(()=>{if(alive)setReady(true);}).catch(e=>setError(e.message));
    void bridge?.liveStop();void bridge?.wakeStop();
    const off=bridge?.subscribe(message=>{if(message.wake)callbacks.current.begin();if(message.panelAction)void callbacks.current.answer(message.panelAction);});
    const timer=setInterval(async()=>{setNow(Date.now());if(!activeRef.current||pending)return;pending=true;try{const next=await api(id);if(alive){setData(next);if(next.checkin&&seen.current!==next.checkin.id){seen.current=next.checkin.id;callbacks.current.begin(next.checkin.text);void bridge?.notify?.(next.checkin).catch(e=>setError(e.message));}}}catch(e){if(alive)setError(e.message);}finally{pending=false;}},2000);
    return()=>{alive=false;clearInterval(timer);off?.();void bridge?.panel?.(null);void bridge?.session(null);};
  },[id,available]);
  useEffect(()=>{void bridge?.panel?.(open?{sessionId:id,transcript:text,listenId}:null).catch(e=>setError(e.message));},[open,id,text,listenId]);
  if(!available)return null;
  return <section className="assistance-card">
    <div className="companion-summary"><div><span className="eyebrow">JARVIS</span><p role="status">{!active?'Session ended · Here if you need me':listening?'Here to help':wakeStatus}</p></div><button className="companion-open" onClick={()=>begin()}>Ask Jarvis <span aria-hidden="true">↗</span></button></div>
    {active&&data.score>=3&&!data.breakStartedAt&&<div className="break-prompt"><span>A short break may help.</span><button onClick={()=>void answer('break_start')}>Take a break</button></div>}
    {active&&data.breakStartedAt&&<div className="break-prompt"><span>Break · {Math.floor((now-data.breakStartedAt)/1000)}s</span><button disabled={now-data.breakStartedAt<60000} onClick={()=>void answer('break_done')}>Back to work</button></div>}
    <details className="companion-options"><summary>Voice & preferences</summary><label><input type="checkbox" checked={wake} onChange={e=>{setWake(e.target.checked);localStorage.setItem('companion.handsfree',String(e.target.checked));}}/> Listen for “hey Jarvis”</label><p>Say “hey Jarvis,” wait for the chime, then ask. Pause to send. You can also type in the companion.</p><p>Screen requests capture once. Audio and screenshots are not saved. Manage work memory in the companion menu.</p><div className="companion-meta"><span>Break score {data.score??0} / 5</span><span>Pulse · {data.pulse?.phase?.replaceAll('_',' ')??'calibrating'}</span></div></details>
    {error&&<p className="inline-alert" role="alert">{error}</p>}
    {open&&!bridge?.panel&&<div className="help-popup"><CompanionChat sessionId={id} initialText={text} listenId={listenId} onAction={value=>void answer(value)}/><button onClick={()=>void answer('close')}>Close</button></div>}
  </section>;
}
