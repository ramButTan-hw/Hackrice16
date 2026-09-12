import test from 'node:test';
import assert from 'node:assert/strict';
import {sqliteRepository} from '../server/repository.js';
import {sessionService} from '../server/session-service.js';
import {monitoringService} from '../server/monitor.js';
test('demo analysis failure delivers one labeled local fallback, within the existing budget',async()=>{
  let now=1000000,calls=0;const repo=sqliteRepository(':memory:'),sessions=sessionService(repo,()=>now);
  const monitor=monitoringService({sessions,now:()=>now,configured:()=>true,insight:async(_snapshot,options)=>{calls++;assert.equal(options.timeoutMs,8000);throw Object.assign(new Error('Timed out'),{name:'TimeoutError'});}});
  try{
    const s=await sessions.start({goal:'Demo',source:'demo',demoScenario:'sustained_pulse'});await monitor.configure(s.id,{enabled:true});
    for(let t=0;t<100000;t+=2000){now=s.startedAt+t;await monitor.tick();}
    const result=await sessions.get(s.id);assert.equal(calls,1);assert.equal(result.interventions.length,1);assert.equal(result.interventions[0].provider,'demo');assert.match(result.monitor.error,/timed out/);assert.ok(result.assistance.checkin);
  }finally{await monitor.close();repo.close();}
});
for(const step of [2000,3800])test(`demo survives ${step}ms polling, triggers one AI review, and ends manually`,async()=>{
  let now=1000000;const repo=sqliteRepository(':memory:'),sessions=sessionService(repo,()=>now),calls=[];
  let reviewAt;
  const monitor=monitoringService({sessions,now:()=>now,configured:()=>true,insight:async snapshot=>{calls.push(snapshot);reviewAt=now;return {decision:'intervene',reason:'Sustained change',message:'How is the work going?'};}});
  try{
    const s=await sessions.start({goal:'Demo task',source:'demo',demoScenario:'sustained_pulse'});
    const real=await sessions.start({goal:'Real task',source:'presage'});
    await monitor.configure(s.id,{enabled:true});
    for(let offset=0;offset<=160000;offset+=step){now=s.startedAt+offset;await monitor.tick();}
    const result=await sessions.get(s.id);
    assert.equal(calls.length,1);assert.ok(reviewAt-s.startedAt>=60000&&reviewAt-s.startedAt<=80000);assert.equal(calls[0].simulatedBiometrics,true);assert.equal(calls[0].analysis.provider,'local');
    assert.ok(Math.abs(result.assistance.pulse.baseline.bpm-72)<2);assert.equal(result.assistance.score,1);assert.ok(result.assistance.checkin);
    const elevated=result.samples.filter(sample=>sample.timestamp-s.startedAt>=30000&&sample.timestamp-s.startedAt<100000).map(sample=>sample.heartRate);
    assert.ok(new Set(elevated).size>10);assert.ok(elevated.every(value=>value>=90&&value<=98));
    assert.ok(result.samples.every(s=>s.source==='demo'));assert.equal((await sessions.get(real.id)).samples.length,0);
    await monitor.stop(s.id);await sessions.end(s.id);now+=2000;await monitor.tick();
    assert.equal((await sessions.get(s.id)).samples.length,result.samples.length);
    await assert.rejects(sessions.start({goal:'Invalid mixed scenario',source:'presage',demoScenario:'sustained_pulse'}),/Invalid demo/);
  }finally{await monitor.close();repo.close();}
});
