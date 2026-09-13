import test from 'node:test';
import assert from 'node:assert/strict';
import {attentionSample} from '../server/attention.js';
import {assistanceState,answerCheckin} from '../server/break-score.js';
const session=()=>({id:'test',status:'active',source:'presage',startedAt:0,samples:[],interventions:[]});
const feed=(s,state,start,end)=>{for(let time=start;time<=end;time+=2000)attentionSample(s,{state,timestamp:time},time);};
test('short glances and unclear frames never become attention check-ins',()=>{
  const s=session();feed(s,'away',0,20000);feed(s,'screen',22000,30000);feed(s,'phone',32000,50000);feed(s,'unknown',52000,90000);
  assert.equal(s.interventions.length,0);assert.equal(s.attention.seconds,0);
});
test('sustained cues deliver one neutral check-in, with no fatigue points or Gemini request',()=>{
  const s=session();feed(s,'phone',0,30000);
  assert.equal(s.interventions.length,1);assert.equal(s.assistance.checkin.event,'attention_check');assert.match(s.assistance.checkin.text,/Still focused/);assert.equal(s.assistance.score,0);
  feed(s,'phone',32000,60000);assert.equal(s.interventions.length,1);
});
test('breaks, conversation pauses and cooldown suppress checks; recovery rearms them',()=>{
  const s=session(),a=assistanceState(s);a.breakStartedAt=1;feed(s,'away',0,40000);assert.equal(s.interventions.length,0);
  a.breakStartedAt=null;feed(s,'paused',42000,80000);assert.equal(s.interventions.length,0);
  feed(s,'away',82000,112000);assert.equal(s.interventions.length,1);
  answerCheckin(s,{answer:'fine',actionId:'answer1'},114000);
  feed(s,'away',114000,450000);assert.equal(s.interventions.length,1);
  feed(s,'screen',452000,464000);feed(s,'away',466000,496000);assert.equal(s.interventions.length,2);
});
test('stale, reordered, missing and stopped camera data cannot accumulate time',()=>{
  const s=session();feed(s,'away',0,10000);feed(s,'away',25000,45000);assert.equal(s.interventions.length,0);
  assert.throws(()=>attentionSample(s,{state:'away',timestamp:44000},45000),/Out-of-order/);
  assert.throws(()=>attentionSample(s,{state:'away',timestamp:45001},90000),/Stale/);
  assert.throws(()=>attentionSample(s,{state:'focused',timestamp:46000},46000),/Invalid/);
  attentionSample(s,{state:'off',timestamp:47000},47000);assert.equal(s.attention.since,null);
});

test('face loss after a tilt continues the off-screen period; sustained loss asks neutrally',()=>{
  const s=session();feed(s,'away',0,8000);feed(s,'out_of_view',10000,44000);assert.equal(s.interventions.length,0);
  attentionSample(s,{state:'out_of_view',timestamp:46000},46000);
  assert.equal(s.interventions.length,1);assert.match(s.assistance.checkin.text,/Still there|still there/);assert.equal(s.assistance.score,0);
  const brief=session();feed(brief,'out_of_view',0,6000);feed(brief,'screen',8000,30000);assert.equal(brief.interventions.length,0);
});
