import {pulseTiming} from '../shared/demo.js';
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;return n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;};
const usable=s=>!s.excludedFromAnalysis&&!s.onBreak&&Number.isFinite(s.heartRate)&&(s.qualityByMetric?.heartRate??s.quality??0)>=.7;
// Product heuristics, not a stress classifier. Fixed personal baseline per work block.
export function pulseCheckin(session, now, report) {
  const a=session.assistance,timing=pulseTiming(session);
  a.pulse ??= {version:1,baseline:null,phase:'calibrating',issued:false};
  const p=a.pulse, samples=session.samples.filter(s=>s.timestamp>=a.blockStartedAt&&s.timestamp<=now);
  const last=samples.at(-1);
  const pause=reason=>{p.since=null;p.elevatedSeconds=0;p.recoverySince=null;p.phase=reason;return false;};
  if(a.breakStartedAt||now<(a.helpUntil??0)||session.activity?.idleSeconds>=120)return pause('paused');
  if(!last||now-last.timestamp>6000||!usable(last))return pause('low_signal');
  if(!p.baseline){
    let run=[];
    for(const sample of samples){
      if(!usable(sample)){run=[];continue;}
      if(run.length&&sample.timestamp-run.at(-1).timestamp>6000)run=[];
      run.push(sample);
      if(run.length>=timing.baselineSamples&&sample.timestamp-run[0].timestamp>=timing.baselineMs){
        const values=run.map(s=>s.heartRate),center=median(values),mad=median(values.map(v=>Math.abs(v-center)));
        p.baseline={bpm:center,noise:1.4826*mad,establishedAt:sample.timestamp};break;
      }
    }
    if(!p.baseline)return pause('calibrating');
  }
  const recent=samples.filter(s=>s.timestamp>=now-10000);
  if(recent.length<4||recent.at(-1).timestamp-recent[0].timestamp<6000||recent.some((s,i)=>!usable(s)||(i>0&&s.timestamp-recent[i-1].timestamp>6000)))return pause('low_signal');
  if(p.lastAt!=null&&now-p.lastAt>15000){p.since=null;p.recoverySince=null;}p.lastAt=now;
  p.smoothed=median(recent.map(s=>s.heartRate));p.delta=p.smoothed-p.baseline.bpm;
  p.threshold=Math.max(8,p.baseline.bpm*.12,3*p.baseline.noise);
  p.breathingSupport=Boolean(report?.breathingReady&&now-report.timestamp<=15000&&(last.qualityByMetric?.breathingRate??last.quality??0)>=.7&&report.breathingRateChangePercent>15);
  p.requiredSeconds=timing.holdSeconds??(p.breathingSupport?45:60);
  if(p.delta>=p.threshold){
    p.recoverySince=null;p.since??=now;p.elevatedSeconds=(now-p.since)/1000;p.phase=p.issued?'already_checked':'watching_rise';
    if(!p.issued&&p.elevatedSeconds>=p.requiredSeconds){p.issued=true;p.phase='check_in';return true;}
  }else if(p.delta<=p.threshold*.5){
    p.since=null;p.elevatedSeconds=0;p.recoverySince??=now;p.phase='recovering';
    if(now-p.recoverySince>=30000){p.issued=false;p.phase='steady';}
  }else{p.since=null;p.recoverySince=null;p.elevatedSeconds=0;p.phase=p.issued?'already_checked':'watching';}
  return false;
}
