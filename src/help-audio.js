export async function openMicrophone(onSamples,onFailure=()=>{}){
  const context=new AudioContext({sampleRate:16000});let stream;
  let handler=onSamples,closed=false;
  try{
    await context.resume();
    if(context.sampleRate!==16000)throw new Error('This audio device did not accept 16 kHz input. Try another microphone.');
    stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    await context.audioWorklet.addModule('/help-audio.js');
    const node=new AudioWorkletNode(context,'help-audio'),source=context.createMediaStreamSource(stream),mute=context.createGain();mute.gain.value=0;source.connect(node);node.connect(mute);mute.connect(context.destination);
    node.port.onmessage=e=>handler(Int16Array.from(e.data,v=>Math.max(-32768,Math.min(32767,v*32768))));
    node.onprocessorerror=()=>onFailure(new Error('Microphone audio processing stopped. Reconnect voice.'));
    for(const track of stream.getAudioTracks())track.onended=()=>{if(!closed)onFailure(new Error('Microphone disconnected. Reconnect voice.'));};
    const resume=()=>{if(!closed&&context.state==='suspended')void context.resume().catch(()=>onFailure(new Error('Microphone paused. Reconnect voice.')));};
    context.onstatechange=resume;
    return {context,setHandler(next){handler=next;},close(){closed=true;context.onstatechange=null;node.port.onmessage=null;node.onprocessorerror=null;node.disconnect();source.disconnect();stream.getTracks().forEach(t=>{t.onended=null;t.stop();});void context.close();}};
  }catch(e){stream?.getTracks().forEach(t=>t.stop());await context.close();throw e;}
}
export function pcmBase64(pcm){const bytes=new Uint8Array(pcm.length*2),view=new DataView(bytes.buffer);for(let i=0;i<pcm.length;i++)view.setInt16(i*2,pcm[i],true);return btoa(String.fromCharCode(...bytes));}
export function livePlayback(context){let next=0;const sources=new Set();return {
  clear(){for(const s of sources){try{s.stop();}catch{}}sources.clear();next=context.currentTime;},
  play(part){if(!part?.mimeType?.startsWith('audio/pcm'))return;const bytes=Uint8Array.from(atob(part.data),c=>c.charCodeAt(0));const rate=Number(part.mimeType.match(/rate=(\d+)/)?.[1]??24000);if(![16000,24000,48000].includes(rate)||bytes.length%2)return;const view=new DataView(bytes.buffer),buffer=context.createBuffer(1,bytes.length/2,rate),samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(i*2,true)/32768;const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);sources.add(source);source.onended=()=>sources.delete(source);next=next<=context.currentTime?context.currentTime+.2:next;source.start(next);next+=buffer.duration;}
};}
