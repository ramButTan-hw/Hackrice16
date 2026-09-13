import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {guideListener} from '../src/guide-listener.js';
const {guideVoiceCommand}=createRequire(import.meta.url)('../shared/guide-voice.cjs');
test('voice commands tolerate speech punctuation and reject ambiguous approval or negation',()=>{
 for(const text of ["Let's start.",'Let’s start!','Hey Jarvis, lets start'])assert.deepEqual(guideVoiceCommand(text),{action:'start'});
 for(const text of ['I did it.','next step','I have done it!'])assert.deepEqual(guideVoiceCommand(text),{action:'next'});
 for(const text of ["don't start",'I did not do it','do it','approve','yes','click it','I did it but wait'])assert.equal(guideVoiceCommand(text),null);
});
test('muting during transcription discards the result and closes the microphone',async()=>{
 let samples,resolveTranscript,closed=0,commands=0;
 const listener=guideListener({openMicrophone:async fn=>{samples=fn;return {close(){closed++;}};},utterance:()=>()=>({audio:new Blob(['audio'])}),transcribe:()=>new Promise(resolve=>resolveTranscript=resolve),command:async()=>{commands++;},epoch:()=>1,onStatus(){},onResult(){},onError:assert.fail});
 await listener.start();samples(Int16Array.of(1000,1000));await new Promise(resolve=>setImmediate(resolve));
 listener.stop();resolveTranscript({text:'I did it'});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(commands,0);assert.equal(closed,1);assert.equal(listener.enabled,false);
});
test('silence is not uploaded and a recognized command keeps listening',async()=>{
 let samples,uploads=0,commands=[],audio=null;
 const listener=guideListener({openMicrophone:async fn=>{samples=fn;return {close(){}};},utterance:()=>()=>({audio}),transcribe:async()=>{uploads++;return {text:'I did it'};},command:async(text,epoch)=>{commands.push({text,epoch});return {};},epoch:()=>7,onStatus(){},onResult(){},onError:assert.fail});
 await listener.start();samples(Int16Array.of(0));await new Promise(resolve=>setImmediate(resolve));assert.equal(uploads,0);
 audio=new Blob(['audio']);samples(Int16Array.of(1000));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(uploads,1);assert.deepEqual(commands,[{text:'I did it',epoch:7}]);assert.equal(listener.enabled,true);listener.stop();
});
test('no speech keeps the mic open and the next utterance can advance guidance',async()=>{
 let samples,uploads=0,closed=0,commands=0;const notices=[],statuses=[];
 const listener=guideListener({openMicrophone:async fn=>{samples=fn;return {close(){closed++;}};},utterance:()=>()=>({audio:new Blob(['audio'])}),transcribe:async()=>++uploads===1?{text:'',noSpeech:true}:{text:'I did it'},command:async()=>{commands++;return {};},epoch:()=>3,onStatus:s=>statuses.push(s),onResult(){},onNotice:n=>notices.push(n),onError:assert.fail});
 await listener.start();samples(Int16Array.of(1000));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(listener.enabled,true);assert.equal(closed,0);assert.equal(commands,0);assert.equal(statuses.at(-1),'listening');assert.match(notices.at(-1),/Still listening/);
 samples(Int16Array.of(1000));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(commands,1);assert.equal(notices.at(-1),'');listener.stop();
});
test('service failures stop recording and remain distinguishable from no speech',async()=>{
 let samples,closed=0,error;
 const listener=guideListener({openMicrophone:async fn=>{samples=fn;return {close(){closed++;}};},utterance:()=>()=>({audio:new Blob(['audio'])}),transcribe:async()=>({error:'Transcription quota reached.'}),command:assert.fail,epoch:()=>1,onStatus(){},onResult(){},onError:e=>error=e});
 await listener.start();samples(Int16Array.of(1000));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(listener.enabled,false);assert.equal(closed,1);assert.match(error.message,/quota/);
});
test('takeover requires explicit wording and never interprets negation as approval',()=>{
 assert.deepEqual(guideVoiceCommand('Do it for me.'),{action:'takeover'});
 assert.deepEqual(guideVoiceCommand('Please do this step'),{action:'execute'});
 for(const text of ["don't do it for me",'do it for me later','yes','do it'])assert.equal(guideVoiceCommand(text),null);
});
