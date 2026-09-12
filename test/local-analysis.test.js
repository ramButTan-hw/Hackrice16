import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeWindow} from '../server/local-analysis.js';
const samples=()=>Array.from({length:61},(_,i)=>({timestamp:i*2000,heartRate:i<=15?70:90,breathingRate:i<=15?14:18,quality:1}));
test('local rolling statistics preserve separate baselines and breathing support',()=>{
  const report=analyzeWindow({samples:samples()},120000);
  assert.equal(report.provider,'local');assert.equal(report.baselineHeartRate,70);assert.equal(report.baselineBreathingRate,14);
  assert.equal(report.heartRateMean,90);assert.equal(report.breathingRateMean,18);assert.equal(report.breathingReady,true);
  assert.ok(Math.abs(report.breathingRateChangePercent-100*4/14)<1e-10);
  assert.equal(report.heartRateStd,0);assert.equal(report.heartRateSlopePerMinute,0);
});
test('missing breathing preserves pulse; poor, stale and excluded data cannot be ready',()=>{
  const heartOnly=samples().map(s=>({...s,breathingRate:null}));
  const report=analyzeWindow({samples:heartOnly},120000);
  assert.equal(report.heartRateReady,true);assert.equal(report.breathingReady,false);assert.equal(report.breathingRateMean,null);
  for(const field of [{quality:.1},{excludedFromAnalysis:true},{onBreak:true}])assert.equal(analyzeWindow({samples:samples().map(s=>({...s,...field}))},120000).ready,false);
  assert.equal(analyzeWindow({samples:samples()},180000).ready,false);
  const empty=analyzeWindow({samples:[]},0);assert.equal(empty.ready,false);assert.equal(empty.heartRateMean,null);assert.equal(empty.hrvMean,null);
});
test('a new work block recalibrates and a gap cannot establish a baseline',()=>{
  const session={samples:samples(),assistance:{blockStartedAt:90000}};
  assert.equal(analyzeWindow(session,110000).ready,false);
  assert.equal(analyzeWindow(session,120000).baselineHeartRate,90);
  const sparse=samples().filter(s=>s.timestamp<=10000||s.timestamp>=110000);
  assert.equal(analyzeWindow({samples:sparse},120000).baselineHeartRate,null);
});
test('sample deviation and time-based regression are calculated in JavaScript',()=>{
  const rising=Array.from({length:31},(_,i)=>({timestamp:i*2000,heartRate:60+i,quality:1}));
  const report=analyzeWindow({samples:rising},60000);
  assert.ok(Math.abs(report.heartRateSlopePerMinute-30)<1e-9);
  assert.ok(Math.abs(report.heartRateStd-Math.sqrt(2480/30))<1e-9);
});
