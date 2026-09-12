import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateBreak} from '../server/break-score.js';
function fixture(){
  const s={startedAt:0,samples:[]};let time=0,events=0;
  function run(seconds,hr=70,quality=1,report=null){for(let n=0;n<seconds;n+=2){s.samples.push({timestamp:time,heartRate:typeof hr==='function'?hr(time):hr,quality});if(evaluateBreak(s,report?{...report,timestamp:time}:null,time))events++;time+=2000;}return events;}
  run(62);return {s,run,events:()=>events};
}
test('sustained pulse alone triggers once and carries evidence',()=>{
  const f=fixture();assert.equal(f.run(80,90),1);assert.equal(f.run(100,90),1);
  assert.equal(f.s.assistance.pulse.baseline.bpm,70);assert.equal(f.s.assistance.score,1);
});
test('brief spikes and gradual recovery do not trigger',()=>{
  const f=fixture();f.run(10,100);f.run(80,70);assert.equal(f.events(),0);
});
test('gradual rise held high triggers without a sharp spike',()=>{
  const f=fixture();f.run(80,t=>Math.min(90,70+(t-62000)/2000));assert.equal(f.events(),0);
  assert.equal(f.run(40,90),1);
});
test('low signal and assistance interrupt consecutive elevation',()=>{
  const f=fixture();f.run(40,90);f.run(4,90,.1);assert.equal(f.run(40,90),0);
  f.s.assistance.helpUntil=999999;assert.equal(f.run(100,90),0);
});
test('breathing supports a shorter hold and recovery rearms without extra points',()=>{
  const f=fixture();assert.equal(f.run(58,90,1,{breathingReady:true,breathingRateChangePercent:20}),1);
  f.run(50,70);assert.equal(f.run(80,90),2);assert.equal(f.s.assistance.score,1);
});
test('missing data cannot be treated as a sustained hold',()=>{
  const f=fixture();f.run(40,90);const now=f.s.samples.at(-1).timestamp+20000;
  assert.equal(evaluateBreak(f.s,null,now),null);assert.equal(f.s.assistance.pulse.since,null);
});
