import {useEffect,useRef,useState} from 'react';
import {jsonResponse} from './companion-api.js';
import {headAngles,classifyAttentionPose} from '../shared/attention-pose.js';
export default function Attention({video,sessionId,running}){
  const [enabled,setEnabled]=useState(()=>localStorage.getItem('companion.attention')!=='false'),[reset,setReset]=useState(0),[status,setStatus]=useState('Waiting for camera');
  const paused=useRef(false);
  const [tilt,setTilt]=useState(null);
  useEffect(()=>{const listener=e=>{paused.current=e.detail;};window.addEventListener('attention-pause',listener);return()=>window.removeEventListener('attention-pause',listener);},[]);
  useEffect(()=>{
    setTilt(null);
    if(!sessionId||!running||!enabled){setStatus(!enabled?'Attention checks off':'Waiting for camera');return;}
    let disposed=false,timer,worker,busy=false,baseline=null,calibration=[],pending=false,lastTime=0;
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const context=canvas.getContext('2d');
    const post=async state=>{if(pending||disposed)return;pending=true;try{const data=await fetch('/api/sessions/'+sessionId+'/attention',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state,timestamp:Date.now()})}).then(jsonResponse);if(!disposed&&['away','phone','out_of_view'].includes(state))setStatus((state==='phone'?'Looking down · phone visible':state==='out_of_view'?'Face out of view':'Looking away')+' · '+(data.seconds??0)+' / '+(data.requiredSeconds??30)+' seconds');}catch(e){if(!disposed)setStatus('Attention check: '+e.message);}finally{pending=false;}};
    async function frame(){
      if(disposed||busy)return;
      if(paused.current){calibration=[];void post('paused');setStatus('Paused while talking with Jarvis');timer=setTimeout(frame,2000);return;}
      const source=video.current;
      if(!source||source.readyState<2||source.paused||source.currentTime===lastTime){calibration=[];void post('unknown');setStatus('Waiting for fresh camera frames');timer=setTimeout(frame,2000);return;}
      lastTime=source.currentTime;busy=true;
      try{context.drawImage(source,0,0,640,360);const bitmap=await createImageBitmap(canvas);if(disposed){bitmap.close();return;}worker.postMessage({bitmap,time:performance.now()},[bitmap]);}catch{busy=false;setStatus('Camera frame unavailable');void post('unknown');timer=setTimeout(frame,2000);}
    }
    setStatus('Loading local attention models…');
    worker=new Worker('/attention-worker.js');
    worker.onerror=()=>{setStatus('Attention unavailable. Run npm run setup:attention, then restart.');worker.terminate();void post('unknown');};
    worker.onmessage=({data})=>{
      if(disposed)return;
      if(data.error){setStatus(data.error);worker.terminate();void post('unknown');return;}
      if(data.ready){void frame();return;}
      if(data.pose)Object.assign(data.pose,headAngles(data.matrix)??{});
      setTilt(null);
      busy=false;let state='unknown';
      if(paused.current){state='paused';setStatus('Paused while talking with Jarvis');}
      else if(!data.pose){calibration=[];state=baseline?'out_of_view':'unknown';setStatus(baseline?'Face out of view — waiting before checking in':'Face unclear — look at the screen to calibrate');}
      else if(!baseline){
        calibration.push(data.pose);if(calibration.length>=6){const xs=calibration.map(p=>p.x),ys=calibration.map(p=>p.y),pitches=calibration.map(p=>p.pitch).filter(Number.isFinite);const average=values=>values.reduce((a,b)=>a+b,0)/values.length;if(Math.max(...xs)-Math.min(...xs)<.12&&Math.max(...ys)-Math.min(...ys)<.12&&pitches.length===6&&Math.max(...pitches)-Math.min(...pitches)<8)baseline={x:average(xs),y:average(ys),pitch:average(pitches),yaw:average(calibration.map(p=>p.yaw))};else calibration=[];}
        state='calibrating';setStatus(baseline?'Calibrated — attention checks on':'Look at your screen for 10 seconds to calibrate');
      }else{
        const result=classifyAttentionPose(data.pose,baseline,data.phone);state=result.state;setTilt(result.tilt);
        if(state==='screen')setStatus('Facing your screen');
      }
      void post(state);timer=setTimeout(frame,2000);
    };
    worker.postMessage({init:true});
    return()=>{disposed=true;clearTimeout(timer);worker.terminate();void fetch('/api/sessions/'+sessionId+'/attention',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:'off',timestamp:Date.now()})}).catch(()=>{});};
  },[sessionId,running,enabled,reset]);
  return <div className="attention-controls"><label><input type="checkbox" checked={enabled} onChange={e=>{setEnabled(e.target.checked);localStorage.setItem('companion.attention',String(e.target.checked));}}/> Local attention check-ins</label><p role="status">{status}</p><details className="diagnostic-details"><summary>Attention settings</summary>{tilt!==null&&<small>Head tilt from screen position: {Math.round(tilt)}° · 18° threshold (12° with a phone visible)</small>}{enabled&&running&&<button type="button" onClick={()=>setReset(n=>n+1)}>Recalibrate screen position</button>}<small>Head direction and phone visibility are hints, not proof of distraction. Camera analysis stays on this device. Check-ins wait 30 seconds and respect breaks and cooldowns.</small></details></div>;
}
