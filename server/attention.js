import {fail} from '../shared/contracts.js';
import {assistanceState,createCheckin} from './break-score.js';
import {appendEvent} from './event-log.js';
export function attentionSample(session,input,now){
  if(!['screen','away','phone','out_of_view','unknown','paused','off','calibrating'].includes(input?.state))fail('Invalid attention observation.');
  if(!Number.isFinite(input.timestamp)||Math.abs(now-input.timestamp)>10000)fail('Stale attention observation.');
  const a=assistanceState(session);const p=session.attention??={since:null,lastAt:null,lastCheckinAt:null,rearmed:true};
  if(p.lastAt!=null&&input.timestamp<=p.lastAt)fail('Out-of-order attention observation.');
  const gap=p.lastAt==null||input.timestamp-p.lastAt>7000;p.lastAt=input.timestamp;
  const previous=p.state;p.state=input.state;
  const blocked=a.breakStartedAt||a.checkin||now<(a.helpUntil??0)||now<a.quietUntil;
  if(gap||blocked||!['away','phone','out_of_view'].includes(input.state)){p.since=null;p.seconds=0;}
  if(input.state==='screen'){
    if(gap||previous!=='screen')p.recoveryAt=now;
    if(now-(p.recoveryAt??now)>=10000)p.rearmed=true;
  }else p.recoveryAt=null;
  p.requiredSeconds=input.state==='out_of_view'?45:30;
  if(!blocked&&['away','phone','out_of_view'].includes(input.state)){p.since??=now;p.seconds=Math.floor((now-p.since)/1000);
    if(p.seconds>=p.requiredSeconds&&p.rearmed&&now-(p.lastCheckinAt??-Infinity)>=300000){
      p.lastCheckinAt=now;p.rearmed=false;p.since=null;
      const checkin=createCheckin(session,input.state==='out_of_view'?'Hey, still there? Working on something off-screen, or taking a break?':'Hey, how are we doing? Still focused on your task, or would a hand or a short break help?','attention_check',now);
      session.interventions.push({id:checkin.id,timestamp:now,text:checkin.text,provider:'local_attention',state:'possible_distraction'});
      appendEvent(session,now,'attention','checkin',{cue:input.state,seconds:p.seconds,source:'local_camera'});
    }
  }
  if(previous!==p.state)appendEvent(session,now,'attention','state',{state:p.state,source:'local_camera'});
  return p;
}
