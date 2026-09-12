import test from 'node:test';
import assert from 'node:assert/strict';
import {openMicrophone,livePlayback} from '../src/help-audio.js';
test('streamed playback buffers the first chunk and schedules subsequent chunks continuously',()=>{
  const starts=[],stopped=[];
  const context={currentTime:1,destination:{},createBuffer:(_channels,length,rate)=>({duration:length/rate,getChannelData:()=>new Float32Array(length)}),createBufferSource:()=>({connect(){},start(time){starts.push(time);},stop(){stopped.push(true);}})};
  const player=livePlayback(context),part={mimeType:'audio/pcm;rate=24000',data:Buffer.alloc(4800).toString('base64')};
  player.play(part);player.play(part);assert.ok(Math.abs(starts[0]-1.2)<1e-9);assert.ok(Math.abs(starts[1]-1.3)<1e-9);
  context.currentTime=1.39;player.play(part);assert.ok(Math.abs(starts[2]-1.4)<1e-9,'Do not insert silence when only 10ms of queued audio remains');
  player.clear();assert.equal(stopped.length,3);
  context.currentTime=2;player.play(part);assert.ok(Math.abs(starts[3]-2.2)<1e-9);
});
test('wake-to-live handoff reuses capture and keeps forwarding later voice frames',async t=>{
  const original=Object.fromEntries(['AudioContext','AudioWorkletNode','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(()=>{for(const [key,descriptor] of Object.entries(original)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  let node,starts=0,stops=0,resumes=0,wakeFrames=0,liveFrames=0;
  const track={stop(){stops++;}},connection=()=>({connect(){},disconnect(){}});
  class Context{sampleRate=16000;state='running';audioWorklet={addModule:async()=>{}};resume(){resumes++;this.state='running';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}createMediaStreamSource(){return connection();}createGain(){return {...connection(),gain:{value:1}};}}
  class Worklet{constructor(){node=this;this.port={};}connect(){}disconnect(){}}
  for(const [key,value] of Object.entries({AudioContext:Context,AudioWorkletNode:Worklet,navigator:{mediaDevices:{getUserMedia:async()=>{starts++;return {getTracks:()=>[track],getAudioTracks:()=>[track]};}}}}))Object.defineProperty(globalThis,key,{configurable:true,value});
  const microphone=await openMicrophone(()=>wakeFrames++);
  node.port.onmessage({data:[.1,.2]});microphone.setHandler(()=>liveFrames++);
  node.port.onmessage({data:[.1,.2]});node.port.onmessage({data:[.1,.2]});
  assert.equal(wakeFrames,1);assert.equal(liveFrames,2);assert.equal(starts,1);assert.equal(stops,0);
  microphone.context.state='suspended';microphone.context.onstatechange();assert.equal(resumes,2);
  microphone.close();assert.equal(stops,1);assert.equal(node.port.onmessage,null);
});
