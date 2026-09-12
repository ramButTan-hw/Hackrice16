const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const valid=(sample,key)=>!sample.onBreak&&!sample.excludedFromAnalysis&&Number.isFinite(sample[key])&&(sample.qualityByMetric?.[key]??sample.quality??0)>=.7;
function features(samples,window,key,now){
  const good=window.filter(s=>valid(s,key)),average=mean(good.map(s=>s[key]));
  let baseline=null,run=[];
  for(const sample of samples){
    if(!valid(sample,key)){run=[];continue;}
    if(run.length&&sample.timestamp-run.at(-1).timestamp>10000)run=[];
    run.push(sample);
    if(run.length>=10&&sample.timestamp-run[0].timestamp>=30000){baseline=mean(run.map(s=>s[key]));break;}
  }
  let slope=null;
  const enough=good.length>=10&&good.at(-1).timestamp-good[0].timestamp>=20000;
  if(enough){
    const times=good.map(s=>(s.timestamp-good[0].timestamp)/60000),center=mean(times);
    slope=good.reduce((sum,s,i)=>sum+(times[i]-center)*(s[key]-average),0)/times.reduce((sum,t)=>sum+(t-center)**2,0);
  }
  return {baseline,average,deviation:good.length?Math.sqrt(good.reduce((sum,s)=>sum+(s[key]-average)**2,0)/Math.max(1,good.length-1)):null,slope,
    ready:enough&&baseline!==null&&good.length/Math.max(1,window.length)>=.7&&now-good.at(-1).timestamp<=10000,
    change:baseline>0&&average!==null?100*(average/baseline-1):null};
}
// Pure local statistics; no subprocess, license, or network dependency.
export function analyzeWindow(session,now){
  const start=session.assistance?.blockStartedAt??session.startedAt??0;
  const samples=session.samples.filter(s=>s.timestamp>=start&&s.timestamp<=now);
  const window=samples.filter(s=>s.timestamp>=now-60000);
  const h=features(samples,window,'heartRate',now),b=features(samples,window,'breathingRate',now);
  const count=window.filter(s=>valid(s,'heartRate')||valid(s,'breathingRate')).length;
  return {provider:'local',timestamp:now,windowSeconds:60,sampleCount:window.length,validSampleCount:count,qualityFraction:count/Math.max(1,window.length),
    ready:h.ready||b.ready,heartRateReady:h.ready,breathingReady:b.ready,
    baselineHeartRate:h.baseline,baselineBreathingRate:b.baseline,heartRateMean:h.average,breathingRateMean:b.average,
    heartRateStd:h.deviation,breathingRateStd:b.deviation,heartRateSlopePerMinute:h.slope,breathingRateSlopePerMinute:b.slope,
    heartRateChangePercent:h.change,breathingRateChangePercent:b.change,hrvMean:mean(window.filter(s=>valid(s,'hrv')).map(s=>s.hrv)),
    reason:h.ready&&b.ready?'Heart and breathing baselines are ready.':h.ready?'Heart-rate baseline ready; breathing is unavailable or still calibrating.':b.ready?'Breathing baseline ready; heart rate is unavailable or still calibrating.':'No reliable baseline yet. Physiology must not drive conclusions.'};
}
