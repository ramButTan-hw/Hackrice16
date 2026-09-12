// Public audio fixture interrupts an ongoing synthetic reply; no real microphone.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
process.loadEnvFile('.env');
const {createHelpRuntime}=createRequire(import.meta.url)('../electron/help-runtime.cjs');
const runtime=createHelpRuntime(),pcm=readFileSync('data/live-probe.pcm');
let started=false,interrupted=false,heard=false,finished=false;
await new Promise(resolve=>{
  const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);runtime.stop();console.log(JSON.stringify({passed:!error,interrupted,heard,error}));if(error)process.exitCode=1;resolve();};
  const timer=setTimeout(()=>finish('No spoken response after interruption within 50 seconds'),50000);
  async function speak(){
    const input=Buffer.concat([pcm,Buffer.alloc(64000)]);
    for(let i=0;i<input.length&&!finished;i+=1024){runtime.send('audio',input.subarray(i,i+1024).toString('base64'));await delay(32);}
  }
  runtime.startLive(event=>{
    if(event.error)return finish(event.error);
    if(event.setupComplete)runtime.send('text','Count slowly from one to one hundred aloud. If I interrupt, stop counting and answer my question briefly.');
    const s=event.serverContent;
    if(s?.interrupted)interrupted=true;
    if(s?.inputTranscription?.text)heard=true;
    if(s?.modelTurn?.parts?.some(p=>p.inlineData)){
      if(interrupted&&heard)return finish();
      if(!started){started=true;void speak().catch(e=>finish(e.message));}
    }
    for(const call of event.toolCall?.functionCalls??[])runtime.send('tool',{id:call.id,name:call.name,ok:true});
  },'Synthetic interruption test. No demo biometrics or private user context.');
});
