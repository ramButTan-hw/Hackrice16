import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateBreak,answerCheckin} from '../server/break-score.js';
test('feelings replace score contributions, stuck is not fatigue, breaks reset after a minute',()=>{
  const s={startedAt:0,samples:[]};evaluateBreak(s,null,2400000);assert.equal(s.assistance.score,1);
  answerCheckin(s,{answer:'tired',actionId:'a'},2400000);assert.equal(s.assistance.score,4);
  answerCheckin(s,{answer:'tired',actionId:'a'},2400000);assert.equal(s.assistance.answers.length,1);
  answerCheckin(s,{answer:'stuck',actionId:'b'},2400001);assert.equal(s.assistance.score,1);
  answerCheckin(s,{answer:'fine',actionId:'c'},2400002);assert.equal(s.assistance.score,0);
  answerCheckin(s,{answer:'break_start',actionId:'d'},2400010);
  assert.throws(()=>answerCheckin(s,{answer:'break_done',actionId:'e'},2400020),/one minute/);
  answerCheckin(s,{answer:'break_done',actionId:'e'},2460010);assert.equal(s.assistance.score,0);assert.deepEqual(s.assistance.signals,{});
});
test('low confidence and idle cannot earn physiological points',()=>{
  const s={startedAt:0,samples:[{timestamp:100,quality:.1}]};evaluateBreak(s,{ready:true,timestamp:100,heartRateChangePercent:90,breathingRateChangePercent:90},100);
  assert.equal(s.assistance.score,0);s.activity={idleSeconds:200};assert.equal(evaluateBreak(s,null,3000000),null);
});
test('closing task help leaves future check-ins enabled; closing a check-in respects quiet time',()=>{
  const s={startedAt:0,samples:[]};
  answerCheckin(s,{answer:'close',actionId:'chat-close'},40000);
  assert.equal(s.assistance.quietUntil,0);
  s.assistance.checkin={id:'checkin-1'};
  answerCheckin(s,{answer:'close',actionId:'checkin-close'},60000);
  assert.equal(s.assistance.checkin,null);assert.equal(s.assistance.quietUntil,360000);
});
