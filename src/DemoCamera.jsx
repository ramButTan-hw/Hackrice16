import Attention from './Attention.jsx';
import {useEffect,useRef,useState} from 'react';
export default function DemoCamera({sessionId}){
  const video=useRef(null),[error,setError]=useState(''),[on,setOn]=useState(false);
  useEffect(()=>{
    let stopped=false,stream;
    Promise.resolve(window.devicePermissions?.ensure('camera')).then(()=>navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:1280},height:{ideal:720},facingMode:'user'}})).then(async capture=>{
      if(stopped){capture.getTracks().forEach(t=>t.stop());return;}
      stream=capture;video.current.srcObject=capture;await video.current.play();if(!stopped)setOn(true);
    }).catch(e=>{if(!stopped)setError(e.message||'Camera preview unavailable. The simulated scenario can still run.');});
    return()=>{stopped=true;stream?.getTracks().forEach(t=>t.stop());};
  },[]);
  return <section className="camera-checkin"><div className="camera-heading"><strong>Live camera · demo preview</strong><span>{error?'Camera unavailable':on?'Camera on':'Opening camera…'}</span></div><video ref={video} muted playsInline aria-label="Live camera preview during simulated demo"/><p>{error||'Biometrics are simulated. Optional attention checks use this live camera locally; frames are not saved.'}</p><Attention video={video} sessionId={sessionId} running={on}/></section>;
}
