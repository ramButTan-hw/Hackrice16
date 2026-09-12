// Real-provider test: greeting, then two streamed audio turns using Google's public fixture.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
process.loadEnvFile('.env');
const {createHelpRuntime}=createRequire(import.meta.url)('../electron/help-runtime.cjs');
const runtime=createHelpRuntime();
const pcm=readFileSync('data/live-probe.pcm');
let turns=0,heard=0,streaming=false,finished=false;
await new Promise(resolve=>{
  const finish=error=>{if(finished)return;finished=true;clearTimeout(timeout);runtime.stop();console.log(JSON.stringify({passed:!error,turns,heard,error}));if(error)process.exitCode=1;resolve();};
  const timeout=setTimeout(()=>finish('Conversation timed out'),55000);
  async function stream(){
    streaming=true;
    await delay(800);
    const input=Buffer.concat([Buffer.alloc(16000),pcm,Buffer.alloc(48000)]);
    for(let offset=0;offset<input.length&&!finished;offset+=1024){if(!runtime.send('audio',input.subarray(offset,offset+1024).toString('base64')))throw new Error('Audio rejected');await delay(32);}
    streaming=false;
  }
  runtime.startLive(event=>{
    if(event.error)return finish(event.error);
    if(event.setupComplete)runtime.send('text','Say hello briefly, then listen to my next question.');
    if(event.serverContent?.inputTranscription?.text)heard++;
    if(event.serverContent?.turnComplete){turns++;console.log(JSON.stringify({turn:turns,heard}));if(turns>=3)return finish();if(!streaming)void stream().catch(e=>finish(e.message));else void (async()=>{while(streaming&&!finished)await delay(100);if(!finished)await stream();})().catch(e=>finish(e.message));}
  },'Synthetic voice transport verification. Respond briefly to the user.');
});
