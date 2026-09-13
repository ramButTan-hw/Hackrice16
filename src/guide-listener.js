// One utterance at a time; stale transcripts cannot advance a newer guide step.
export function guideListener({openMicrophone,utterance,transcribe,command,epoch,onStatus,onResult,onError,onNotice=()=>{},workletUrl}){
 let generation=0,enabled=false,recorder=null,pending=false,detect=null,heardEpoch=null;
 function reset(){detect=utterance();heardEpoch=null;}
 function stop(){generation++;enabled=false;pending=false;recorder?.close();recorder=null;onStatus('off');}
 async function finish(audio,at,token){
  reset();if(!audio)return;
  pending=true;onStatus('transcribing');
  try{
   const result=await transcribe(await audio.arrayBuffer());
   if(!enabled||generation!==token)return;
   if(result.error)throw new Error(result.error);
   if(result.noSpeech||!result.text?.trim()){
    onNotice('Didn’t catch that. Still listening. Try “I did it” again.');return;
   }
   onNotice('');
   const state=await command(result.text,at);
   if(!enabled||generation!==token)return;
   onResult(state);
   if(state.stopped||state.voicePaused){stop();return;}
  }catch(error){if(generation===token){stop();onError(error);}}
  finally{if(enabled&&generation===token){pending=false;reset();onStatus('listening');}}
 }
 async function start(){
  if(enabled)return;
  enabled=true;const token=++generation;reset();onNotice('');onStatus('starting');
  try{
   const stream=await openMicrophone(pcm=>{
    if(!enabled||generation!==token||pending)return;
    if(heardEpoch===null&&Math.sqrt(pcm.reduce((n,v)=>n+v*v,0)/pcm.length)/32768>=.012)heardEpoch=epoch();
    const result=detect(pcm);if(result)void finish(result.audio,heardEpoch,token);
   },error=>{if(generation===token){stop();onError(error);}},workletUrl);
   if(!enabled||generation!==token){stream.close();return;}
   recorder=stream;onStatus('listening');
  }catch(error){if(generation===token){stop();onError(error);}}
 }
 return {start,stop,get enabled(){return enabled;}};
}
