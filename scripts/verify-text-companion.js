// Real-provider smoke test. Only synthetic/public-fixture data leaves the machine.
import {readFileSync} from 'node:fs';
import {transcribe} from '../server/transcription.js';
import {memoryService} from '../server/memory.js';
import {generateReply} from '../server/chat.js';
process.loadEnvFile('.env');
const memory=memoryService();
const started=Date.now();
const content='Verification preference: offer one small hint before a complete solution. Probe '+Date.now();
let memoryId;
try{
  const saved=await memory.save(content,'demo',{kind:'verification'});memoryId=saved.memory_id??saved.id;
  const recalled=await memory.search(content,'demo');
  console.log(JSON.stringify({stage:'backboard',saved:Boolean(memoryId),recalled:recalled.length,ms:Date.now()-started}));
  const pcm=readFileSync('data/live-probe.pcm');const wav=Buffer.alloc(44);wav.write('RIFF');wav.writeUInt32LE(pcm.length+36,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);
  const t=Date.now();const transcript=await transcribe(Buffer.concat([wav,pcm]),'audio/wav');console.log(JSON.stringify({stage:'elevenlabs',text:transcript.text,ms:Date.now()-t}));
  let first;const g=Date.now();const reply=await generateReply({messages:[{role:'user',text:'Give one brief study tip.'}],memory:false},{onText:()=>{first??=Date.now();}});
  console.log(JSON.stringify({stage:'gemini',text:reply.text,firstTextMs:first-g,totalMs:Date.now()-g}));
}finally{if(memoryId)await memory.remove(memoryId,'demo');}
