import {metric} from '../shared/contracts.js';
import {deriveState} from './state-engine.js';
// Repeatable, smoothly varying synthetic pulse; not physiological measurements.
export function demoHeartRate(seconds){
  const smooth=value=>{const x=Math.max(0,Math.min(1,value));return x*x*(3-2*x);};
  const elevation=smooth((seconds-20)/8)*(1-smooth((seconds-100)/20));
  const drift=(1.1+1.2*elevation)*Math.sin(seconds*.31)+.7*Math.sin(seconds*.73)+.4*Math.sin(seconds*.113);
  return Math.round((72+22*elevation+drift)*10)/10;
}
// A synthetic timeline, not measured data. Batch overdue frames so cloud latency
// cannot masquerade as poor camera quality or erase the demo's sustained rise.
export async function feedDemo(sessions,session,now){
  if(session.source!=='demo'||session.demoScenario!=='sustained_pulse')return;
  if(now-session.startedAt>300000)return;
  await sessions.update(session.id,s=>{
    let timestamp=s.samples.length?s.samples.at(-1).timestamp+2000:s.startedAt;
    for(;timestamp<=now;timestamp+=2000){
      const seconds=(timestamp-s.startedAt)/1000;
      const sample=metric({source:'demo',timestamp,heartRate:demoHeartRate(seconds),breathingRate:15,quality:1},s.source,s.startedAt,now,s.samples.at(-1)?.timestamp);
      sample.excludedFromAnalysis=Boolean(s.assistance?.breakStartedAt||timestamp<(s.assistance?.helpUntil??0));
      s.samples.push(sample);
      sample.state=deriveState(s,sample.timestamp).state;
    }
    s.activity={idleSeconds:0,timestamp:now,source:'demo'};
  });
}
