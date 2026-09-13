import {randomUUID} from 'node:crypto';
import {fail,text} from '../shared/contracts.js';
export function timerView(timer, now=Date.now()){
  const remainingMs=timer.status==='running'?Math.max(0,timer.endsAt-now):timer.remainingMs;
  return {...timer,remainingMs,status:timer.status==='running'&&remainingMs===0?'completed':timer.status};
}
export function widgetService(repository,now=Date.now){
  let queue=Promise.resolve();
  const valid=kind=>{if(!['timer','checklist'].includes(kind))fail('Unknown widget.',404);};
  async function get(kind){valid(kind);const saved=await repository.getWidget(kind);return saved??{id:kind,revision:0,...(kind==='timer'?{title:'Focus time',minutes:25,remainingMs:1500000,status:'idle',endsAt:null}:{title:'My checklist',items:[]})};}
  return {
    async get(kind){const value=await get(kind);return kind==='timer'?timerView(value,now()):value;},
    update(kind,body={}){
      const next=queue.then(async()=>{
        const old=await get(kind),value=kind==='timer'?timerView(old,now()):structuredClone(old);
        if(body.revision!==undefined&&body.revision!==old.revision)fail('This widget changed. Refresh and try again.',409);
        if(kind==='timer'){
          if(body.action==='ensure_running'&&value.status==='running')return value;
          if(body.action==='ensure_running'&&value.status==='paused'){
            value.status='running';value.endsAt=now()+value.remainingMs;
          }else if(body.action==='start'||body.action==='ensure_running'){
            if(value.status==='running')fail('A timer is already running. Pause or reset it first.',409);
            const minutes=body.minutes??value.minutes;
            if(!Number.isInteger(minutes)||minutes<1||minutes>240)fail('Choose 1–240 minutes.');
            Object.assign(value,{minutes,title:body.title===undefined?'Focus time':text(body.title,'title',100),remainingMs:minutes*60000,endsAt:now()+minutes*60000,status:'running'});
          }else if(body.action==='pause'){
            if(value.status==='running'){value.status='paused';value.endsAt=null;}
          }else if(body.action==='resume'){
            if(value.status!=='paused')fail('Only a paused timer can resume.',409);
            value.status='running';value.endsAt=now()+value.remainingMs;
          }else if(body.action==='reset'){value.status='idle';value.endsAt=null;value.remainingMs=value.minutes*60000;}
          else fail('Unknown timer action.');
        }else{
          if(body.action==='add'){
            const items=body.items??[body.text];
            if(!Array.isArray(items)||!items.length||value.items.length+items.length>100)fail('Keep a checklist to 100 items.');
            const added=items.map(item=>({id:randomUUID(),text:text(item,'item',300),done:false}));
            value.items.push(...added);if(body.title!==undefined)value.title=text(body.title,'title',100);
          }else if(body.action==='toggle'){
            const item=value.items.find(i=>i.id===body.id);if(!item)fail('Checklist item not found.',404);
            if(typeof body.done!=='boolean')fail('Specify whether the item is complete.');item.done=body.done;
          }else if(body.action==='remove'){value.items=value.items.filter(i=>i.id!==body.id);}
          else if(body.action==='rename'){value.title=text(body.title,'title',100);}
          else fail('Unknown checklist action.');
        }
        value.revision=old.revision+1;await repository.saveWidget(value,old.revision);return value;
      });queue=next.catch(()=>{});return next;
    },
  };
}
