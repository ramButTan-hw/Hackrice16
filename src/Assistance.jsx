import {useCallback,useEffect,useRef,useState} from 'react';
import {useWake} from './use-wake.js';
import CompanionChat from './CompanionChat.jsx';
import {jsonResponse} from './companion-api.js';
const bridge=window.helpBridge;
async function api(id,answer){return fetch('/api/sessions/'+id+'/assistance',answer?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answer,actionId:crypto.randomUUID()})}:{}).then(jsonResponse);}
export default function Assistance({session}){
  const id=session?.id,active=session?.status==='active';
  const [data,setData]=useState({}),[open,setOpen]=useState(false),[text,setText]=useState(''),[error,setError]=useState(''),[now,setNow]=useState(Date.now());
  const seen=useRef(null),callbacks=useRef({});callbacks.current={begin,answer};
  const [ready,setReady]=useState(false),[listening,setListening]=useState(false),[listenId,setListenId]=useState(0),[wake,setWake]=useState(()=>localStorage.getItem('companion.handsfree')!=='false');
  const onWake=useCallback(()=>callbacks.current.begin(),[]);
  const wakeStatus=useWake(bridge,active&&ready&&wake&&!listening,onWake);
  function begin(checkin=''){setText(checkin);setOpen(true);setListening(true);setListenId(n=>n+1);}
  async function answer(value){
    if(value==='listening'){setListening(true);return;}if(value==='idle'){setListening(false);return;}
    if(value==='close'){setOpen(false);setListening(false);}
    try{const next=await api(id,value);setData(next);if(['fine','break_start'].includes(value)){setOpen(false);setListening(false);}}catch(e){setError(e.message);}
  }
  useEffect(()=>{
    setOpen(false);seen.current=null;setData(session?.assistance??{});if(!active)return;
    let alive=true,pending=false;
    setReady(false);setListening(false);
    void bridge?.session(id).then(()=>{if(alive)setReady(true);}).catch(e=>setError(e.message));
    void bridge?.liveStop();void bridge?.wakeStop();
    const off=bridge?.subscribe(message=>{if(message.wake)callbacks.current.begin();if(message.panelAction)void callbacks.current.answer(message.panelAction);});
    const timer=setInterval(async()=>{setNow(Date.now());if(pending)return;pending=true;try{const next=await api(id);if(alive){setData(next);if(next.checkin&&seen.current!==next.checkin.id){seen.current=next.checkin.id;callbacks.current.begin(next.checkin.text);}}}catch(e){if(alive)setError(e.message);}finally{pending=false;}},2000);
    return()=>{alive=false;clearInterval(timer);off?.();void bridge?.panel?.(null);void bridge?.session(null);};
  },[id,active]);
  useEffect(()=>{void bridge?.panel?.(open?{sessionId:id,transcript:text,listenId}:null).catch(e=>setError(e.message));},[open,id,text,listenId]);
  if(!active)return null;
  return <section className="assistance-card"><div className="camera-heading"><strong>Work companion</strong><span>Break score {data.score??0} / 5</span></div><p>{listening?'Companion active':wakeStatus}</p><label><input type="checkbox" checked={wake} onChange={e=>{setWake(e.target.checked);localStorage.setItem('companion.handsfree',String(e.target.checked));}}/> Enable “hey Jarvis” during sessions</label><button onClick={()=>begin()}>Open companion</button><small>Say “hey Jarvis,” wait for the chime, then ask your question. Pause to send. Follow-ups work without the wake phrase for 12 seconds after a reply. Ctrl+Shift+Space also works.</small><p>Screen sharing is optional. Audio and screenshots are not saved by this app. Memory stores short user-stated work context in Backboard; review or delete it in the companion.</p>{data.score>=3&&!data.breakStartedAt&&<p>A short break may help. <button onClick={()=>void answer('break_start')}>Take a break</button></p>}{data.breakStartedAt&&<p>Break: {Math.floor((now-data.breakStartedAt)/1000)} seconds <button disabled={now-data.breakStartedAt<60000} onClick={()=>void answer('break_done')}>Back to work</button></p>}<p>Pulse check-in: {data.pulse?.phase?.replaceAll('_',' ')??'calibrating'}</p>{error&&<p role="alert">{error}</p>}{open&&!bridge?.panel&&<div className="help-popup"><CompanionChat sessionId={id} initialText={text} listenId={listenId} onAction={value=>void answer(value)}/><button onClick={()=>void answer('close')}>Close</button></div>}</section>;
}

