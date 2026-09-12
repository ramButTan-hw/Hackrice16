import test from 'node:test';
import assert from 'node:assert/strict';
import {sqliteRepository} from '../server/repository.js';
import {sessionService} from '../server/session-service.js';
import {monitoringService} from '../server/monitor.js';
import {analyzeInsight} from '../server/insights.js';
import {answerCheckin} from '../server/break-score.js';
async function fixture(t,options={}){
  let time=1000000;const repository=sqliteRepository(':memory:'),sessions=sessionService(repository,()=>time);
  const session=await sessions.start({goal:'Solve a calculus problem',source:'demo'}),calls=[];
  const monitor=monitoringService({sessions,now:()=>time,configured:()=>true,
    insight:async snapshot=>{calls.push(snapshot);return {decision:'intervene',reason:'New sustained change.',message:'How is the work going?'};},...options});
  await monitor.configure(session.id,{enabled:true,voice:false});
  t.after(async()=>{await monitor.close();repository.close();});
  let previous=-2;
  async function observe(seconds,quality=1,heartRate=null){for(let n=previous+2;n<=seconds;n+=2){time=session.startedAt+n*1000;await sessions.ingest(session.id,{source:'demo',timestamp:time,heartRate:heartRate??(n<=60?72:92),breathingRate:15,quality});}previous=seconds;time=session.startedAt+seconds*1000;await monitor.activity(session.id,{idleSeconds:0});}
  return {sessions,monitor,id:session.id,calls,observe,setTime:s=>{time=session.startedAt+s*1000;}};
}
test('sustained physiology triggers one review; repeated samples do not call Gemini',async t=>{
  const f=await fixture(t);await f.observe(60);await f.monitor.tick();assert.equal(f.calls.length,0);
  for(const n of [70,80,90,100,110,120]){await f.observe(n);await f.monitor.tick();}await f.observe(130);await f.monitor.tick();assert.equal(f.calls.length,1);
  for(const n of [140,180,240,300]){await f.observe(n);await f.monitor.tick();}
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].samples,undefined);assert.equal(f.calls[0].task,'Solve a calculus problem');assert.equal(f.calls[0].analysis.provider,'local');
  const s=await f.sessions.get(f.id);assert.equal(s.assistance.score,1);assert.ok(s.assistance.checkin);
});
test('steady physiology, low quality, and stale samples do not trigger reviews',async t=>{
  const f=await fixture(t);for(const n of [60,90,120]){await f.observe(n,.1);await f.monitor.tick();}assert.equal(f.calls.length,0);
  const g=await fixture(t);
  for(const n of [60,90,120,180]){await g.observe(n,1,72);await g.monitor.tick();}assert.equal(g.calls.length,0);
  f.setTime(150);await f.monitor.tick();assert.equal((await f.monitor.status(f.id)).status,'waiting_signal');
});
test('long work block asks once without camera data',async t=>{
  const f=await fixture(t);f.setTime(2400);await f.monitor.tick();assert.equal(f.calls.length,1);assert.equal(f.calls[0].physiologyReliable,false);
  f.setTime(2500);await f.monitor.tick();assert.equal(f.calls.length,1);
});
for(const action of ['pause','end'])test(`${action} cancels in-flight delivery`,async t=>{
  let finish,begin;const started=new Promise(r=>{begin=r;});
  const f=await fixture(t,{insight:async()=>{begin();return new Promise(r=>{finish=r;});}});
  await f.observe(60);await f.monitor.tick();for(const n of [70,80,90,100,110,120]){await f.observe(n);await f.monitor.tick();}await f.observe(130);const request=f.monitor.tick();await started;
  await f.monitor.tick();if(action==='pause')await f.monitor.configure(f.id,{enabled:false});else{await f.monitor.stop(f.id);await f.sessions.end(f.id);}
  finish({decision:'intervene',message:'Too late'});await request;assert.equal((await f.sessions.get(f.id)).interventions.length,0);
});
test('failed attempts do not repeat every timer tick',async t=>{
  let attempts=0;const f=await fixture(t,{insight:async()=>{attempts++;throw new Error('Quota');}});
  for(const n of [60,70,80,90,100,110,120,130,180]){await f.observe(n);await f.monitor.tick();}assert.equal(attempts,1);
});
test('no-intervention is logged and help excludes physiological samples',async t=>{
  const f=await fixture(t,{insight:async()=>({decision:'no_intervention',reason:'Keep working',message:''})});
  await f.observe(60);await f.monitor.tick();for(const n of [70,80,90,100,110,120]){await f.observe(n);await f.monitor.tick();}await f.observe(130);await f.monitor.tick();assert.equal((await f.sessions.get(f.id)).interventions.length,0);
  assert.equal((await f.sessions.get(f.id)).monitor.decisions.length,1);
  await f.sessions.update(f.id,s=>answerCheckin(s,{answer:'help_start',actionId:'help'},s.startedAt+140000));
  await f.observe(150);assert.equal((await f.sessions.get(f.id)).samples.at(-1).excludedFromAnalysis,true);
});
test('Gemini returns bounded structured decisions and usage',async()=>{
  const result=await analyzeInsight({}, {apiKey:'test',model:'gemini-2.5-flash',fetcher:async(_u,o)=>{
    const body=JSON.parse(o.body);assert.equal(body.generationConfig.thinkingConfig.thinkingBudget,0);
    return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({decision:'no_intervention',reason:'No event',message:''})}]}}],usageMetadata:{totalTokenCount:120}})};
  }});assert.equal(result.usage.totalTokens,120);
});
