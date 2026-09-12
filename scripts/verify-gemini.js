// Small real-provider smoke test: synthetic context only, no microphone or screen.
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {analyzeInsight} from '../server/insights.js';
if(existsSync('.env'))process.loadEnvFile('.env');
const clean=value=>String(value).split(process.env.GEMINI_API_KEY||'\0').join('[redacted]').slice(0,700);
if(!process.env.GEMINI_API_KEY){console.log('GEMINI_API_KEY is missing.');process.exit(1);}
const started=Date.now();
try{
  const result=await analyzeInsight({task:'Smoke test: study algebra',event:'long_work_block',elapsedSeconds:2400,physiologyReliable:false,analysis:null,presage:null,inactivity:{idleSeconds:0},previousIntervention:null},{fetcher:async(...args)=>{
    const response=await fetch(...args);
    if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(`HTTP ${response.status}: ${clean(body.error?.message||response.statusText)}`);}
    return response;
  }});
  console.log(JSON.stringify({analysis:'passed',milliseconds:Date.now()-started,...result}));
}catch(error){console.log('Analysis failed: '+clean(error.message));process.exitCode=1;}
const {createHelpRuntime}=createRequire(import.meta.url)('../electron/help-runtime.cjs');
let socket;
class TestSocket extends WebSocket{constructor(url){super(url);socket=this;}}
const runtime=createHelpRuntime({Socket:TestSocket});
await new Promise(resolve=>{
  let finished=false,audio=false,setup=false;
  const start=Date.now();
  const finish=message=>{if(finished)return;finished=true;clearTimeout(timeout);runtime.stop();console.log(message);resolve();};
  const timeout=setTimeout(()=>{process.exitCode=1;finish('Live failed: no complete audio response within 30 seconds.');},30000);
  try{runtime.startLive(event=>{
    if(event.error){process.exitCode=1;finish('Live failed: '+clean(event.error));return;}
    if(event.setupComplete){setup=true;runtime.send('text','This is a connection test. Say only: Ready to help.');}
    if(event.serverContent?.modelTurn?.parts?.some(part=>part.inlineData?.mimeType?.startsWith('audio/pcm')))audio=true;
    if(event.serverContent?.turnComplete){if(!audio)process.exitCode=1;finish(JSON.stringify({live:audio?'passed':'no audio',setup,audio,milliseconds:Date.now()-start}));}
  },JSON.stringify({goal:'Synthetic connection test; no real user data.'}));}catch(error){process.exitCode=1;finish('Live failed: '+clean(error.message));}
});
