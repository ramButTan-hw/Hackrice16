import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createHelpRuntime}=createRequire(import.meta.url)('../electron/help-runtime.cjs');
test('Live connects only on request, sends no audio before setup, redacts keys, and stops',async()=>{
  let socket;class FakeSocket{constructor(){socket=this;this.messages=[];this.bufferedAmount=0;}send(v){this.messages.push(JSON.parse(v));}close(){this.closed=true;}}
  const runtime=createHelpRuntime({Socket:FakeSocket,env:{GEMINI_API_KEY:'secret-value'}});assert.equal(socket,undefined);assert.equal(runtime.send('audio','AAAA'),false);
  const events=[];runtime.startLive(e=>events.push(e),'Task');socket.onopen();assert.equal(runtime.send('audio','AAAA'),false);
  socket.onmessage({data:'{"setupComplete":{}}'});await new Promise(r=>setImmediate(r));
  assert.equal(runtime.send('text','Speak this check-in aloud now.'),true);assert.equal(socket.messages.at(-1).clientContent.turnComplete,true);await assert.rejects(async()=>runtime.send('text','x'.repeat(1501)),/Invalid opening/);
  assert.equal(runtime.send('tool',{id:'dismiss-1',name:'close_assistance',ok:true}),true);assert.equal(socket.messages.at(-1).toolResponse.functionResponses[0].name,'close_assistance');
  assert.equal(runtime.send('audio','AAAA'),true);assert.equal(socket.messages.at(-1).realtimeInput.audio.mimeType,'audio/pcm;rate=16000');
  assert.throws(()=>runtime.send('audio','x'.repeat(17000)),/Invalid media/);
  socket.onclose({code:1011,reason:'secret-value exhausted'});assert.ok(!events.at(-1).error.includes('secret-value'));assert.equal(socket.closed,true);assert.equal(runtime.send('audio','AAAA'),false);runtime.stop();
});
test('late errors and open events from a replaced socket cannot stop the new connection',async()=>{
  const sockets=[];
  class Socket{constructor(){sockets.push(this);this.messages=[];this.bufferedAmount=0;}send(value){this.messages.push(JSON.parse(value));}close(){this.closed=true;}}
  const runtime=createHelpRuntime({Socket,env:{GEMINI_API_KEY:'test'}}),events=[];
  try{
    runtime.startLive(e=>events.push(e),'first');const old=sockets[0];
    runtime.startLive(e=>events.push(e),'replacement');const current=sockets[1];
    current.onopen();current.onmessage({data:'{"setupComplete":{}}'});await new Promise(r=>setImmediate(r));
    old.onerror();old.onopen();old.onclose({code:1006,reason:'old connection'});
    old.onmessage({data:'invalid JSON'});await new Promise(r=>setImmediate(r));
    assert.equal(runtime.status().connected,true);assert.equal(current.closed,undefined);assert.equal(old.messages.length,0);
    assert.equal(runtime.send('audio','AAAA'),true);assert.equal(events.filter(e=>e.error).length,0);
  }finally{runtime.stop();}
});

test('wake setup is optional and missing setup has an actionable error',async()=>{
  const runtime=createHelpRuntime({Socket:class{constructor(){throw new Error('Unexpected network');}},env:{WAKE_PYTHON:'/missing/python'}});
  assert.equal(runtime.status().wakeConfigured,false);await assert.rejects(runtime.startWake(),/setup-wake/);assert.equal(await runtime.wakeAudio(new Int16Array(512)),false);runtime.stop();
});
test('local wake processing releases without a cloud connection',async()=>{
  let released=false,frames=0;
  const runtime=createHelpRuntime({Socket:class{constructor(){throw new Error('Unexpected cloud connection');}},WakeFactory:()=>({start:async()=>({sampleRate:16000}),process:async frame=>{frames++;return frame.length===512;},release(){released=true;}}),env:{}});
  assert.equal((await runtime.startWake()).sampleRate,16000);assert.equal(await runtime.wakeAudio(new Int16Array(512)),true);assert.equal(frames,1);
  await assert.rejects(runtime.wakeAudio(new Int16Array(4097)),/Invalid/);runtime.stop();assert.equal(released,true);
});
