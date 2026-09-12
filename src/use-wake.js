import {useEffect,useState} from 'react';
import {openMicrophone} from './help-audio.js';
export function useWake(bridge,enabled,onWake){
  const [status,setStatus]=useState('Wake word paused');
  useEffect(()=>{
    if(!enabled||!bridge){setStatus('Wake word paused');return;}
    let alive=true,mic,found=false,sending=false,queued=[];
    setStatus('Starting local wake detector…');
    const fail=e=>{if(!alive)return;found=true;mic?.close();void bridge.wakeStop();setStatus(e.message);};
    void (async()=>{
      await bridge.wakeStart();if(!alive)return;
      mic=await openMicrophone(pcm=>{
        if(!alive||found)return;queued.push(...pcm);
        if(sending||queued.length<1280)return;
        const frame=Int16Array.from(queued.splice(0,1280));if(queued.length>4096)queued=[];sending=true;
        void bridge.wakeAudio(frame).then(detected=>{if(detected&&alive&&!found){found=true;mic?.close();void bridge.wakeStop();onWake();}}).catch(fail).finally(()=>{sending=false;});
      },fail);
      if(!alive){mic.close();return;}setStatus('Listening locally for “hey Jarvis”');
    })().catch(fail);
    return()=>{alive=false;mic?.close();void bridge.wakeStop();};
  },[bridge,enabled,onWake]);
  return status;
}
