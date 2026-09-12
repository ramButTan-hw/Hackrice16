import { randomUUID } from 'node:crypto';
import { fail } from '../shared/contracts.js';
import { pulseCheckin } from './pulse-checkin.js';
export const BREAK_RULES = { longBlockMs: 40*60000, quietMs: 5*60000, minimumBreakMs: 60000, threshold: 3 };
export function assistanceState(s) {
  s.assistance ??= { score:0, signals:{}, history:[], answers:[], actions:[], blockStartedAt:s.startedAt, quietUntil:0 };
  return s.assistance;
}
function record(a, now, reason) {
  a.score=Math.max(0,Math.min(5,(a.signals.physiology?1:0)+(a.signals.longBlock?1:0)+(a.feeling==='tired'?3:a.feeling==='fine'?-2:0)));
  a.history=[...a.history,{timestamp:now,score:a.score,reason}].slice(-150);
}
// Returns an event once per work block. Missing signal never earns points.
export function evaluateBreak(s, report, now) {
  const a=assistanceState(s);
  if(a.breakStartedAt||now<(a.helpUntil??0)||s.activity?.idleSeconds>=120){if(a.pulse){a.pulse.since=null;a.pulse.recoverySince=null;a.pulse.phase='paused';}return null;}
  let event=null;
  if(!a.signals.longBlock&&now>=a.quietUntil&&!a.checkin&&now-a.blockStartedAt>=BREAK_RULES.longBlockMs){a.signals.longBlock=true;record(a,now,'40-minute uninterrupted work block');event='long_work_block';}
  if(report===undefined)return event;
  if(pulseCheckin(s,now,report)){if(!a.signals.physiology){a.signals.physiology=true;record(a,now,'Sustained pulse elevation versus personal baseline');}event='physiological_change';}
  return event;
}
export function answerCheckin(s, body, now) {
  const a=assistanceState(s);
  if(typeof body?.actionId!=='string'||!/^[\w-]{1,80}$/.test(body.actionId))fail('Invalid response ID.');
  if(a.actions.includes(body.actionId))return a;
  if(!['close','fine','stuck','tired','dismiss','break_start','break_done','help_start','help_end','helpful','not_helpful'].includes(body.answer))fail('Invalid check-in response.');
  if(body.answer==='break_done'&&(!a.breakStartedAt||now-a.breakStartedAt<BREAK_RULES.minimumBreakMs))fail('Take at least one minute before completing the break.');
  a.actions=[...a.actions,body.actionId].slice(-150);
  a.answers=[...a.answers,{timestamp:now,answer:body.answer,checkinId:a.checkin?.id??null}].slice(-150);
  if(body.answer==='close'){
    // Closing ordinary task help does not dismiss a future biometric check-in.
    if(a.checkin){a.checkin=null;a.quietUntil=now+BREAK_RULES.quietMs;}
    a.helpUntil=null;
  }
  if(['fine','stuck','tired','dismiss'].includes(body.answer)) {
    if(body.answer!=='dismiss')a.feeling=body.answer;
    a.checkin=null;a.quietUntil=now+BREAK_RULES.quietMs;
  }
  if(body.answer==='break_start'){a.breakStartedAt=now;a.checkin=null;}
  if(body.answer==='break_done'){a.breakStartedAt=null;a.signals={};a.feeling=null;a.pulse=null;a.blockStartedAt=now;a.quietUntil=now+BREAK_RULES.quietMs;}
  if(body.answer==='help_start'){a.helpUntil=now+150000;a.checkin=null;if(a.pulse){a.pulse.since=null;a.pulse.recoverySince=null;a.pulse.phase='paused';}}
  if(body.answer==='help_end'){a.helpUntil=null;a.quietUntil=now+BREAK_RULES.quietMs;}
  record(a,now,'User response: '+body.answer);return a;
}
export function createCheckin(s,text,event,now){
  const a=assistanceState(s);a.checkin={id:randomUUID(),text,event,timestamp:now};a.quietUntil=now+BREAK_RULES.quietMs;return a.checkin;
}
