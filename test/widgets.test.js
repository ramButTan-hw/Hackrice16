import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sqliteRepository} from '../server/repository.js';
import {widgetService} from '../server/widgets.js';
import {widgetRequest,openWidget} from '../src/widget-request.js';
import {createApp} from '../server/app.js';
function fixture(t){const repo=sqliteRepository(':memory:');t.after(()=>repo.close());let now=100000;return {repo,service:widgetService(repo,()=>now),advance:ms=>now+=ms};}
test('timer start, pause, resume and completion use elapsed time rather than ticks',async t=>{
 const f=fixture(t);let timer=await f.service.update('timer',{action:'start',minutes:25});assert.equal(timer.endsAt,1600000);
 f.advance(60000);timer=await f.service.update('timer',{action:'pause'});assert.equal(timer.remainingMs,1440000);
 f.advance(600000);assert.equal((await f.service.get('timer')).remainingMs,1440000);
 timer=await f.service.update('timer',{action:'resume'});f.advance(1440001);timer=await f.service.get('timer');assert.equal(timer.status,'completed');assert.equal(timer.remainingMs,0);
 await assert.rejects(f.service.update('timer',{action:'resume'}),{status:409});
 timer=await f.service.update('timer',{action:'start',minutes:5,title:'Short break'});assert.equal(timer.remainingMs,300000);
});
test('active timers cannot be silently overwritten and stale updates are rejected',async t=>{
 const {service}=fixture(t);await service.update('timer',{action:'start',minutes:1});
 await assert.rejects(service.update('timer',{action:'start',minutes:5}),{status:409});
 await assert.rejects(service.update('timer',{action:'reset',revision:0}),{status:409});
 const timer=await service.update('timer',{action:'reset',revision:1});assert.equal(timer.status,'idle');assert.equal(timer.endsAt,null);
 for(const minutes of [0,-1,241,1.5,'25'])await assert.rejects(service.update('timer',{action:'start',minutes}),{status:400});
});
test('checklists append, complete, remove and preserve unrelated items',async t=>{
 const {service}=fixture(t);let list=await service.update('checklist',{action:'add',items:['Read notes','Practice questions'],title:'Study'});
 const first=list.items[0].id;list=await service.update('checklist',{action:'toggle',id:first,done:true});assert.equal(list.items[0].done,true);
 list=await service.update('checklist',{action:'add',text:'Review mistakes'});assert.equal(list.items.length,3);assert.equal(list.items[0].done,true);
 list=await service.update('checklist',{action:'remove',id:first});assert.equal(list.items.length,2);
 await assert.rejects(service.update('checklist',{action:'add',items:Array(101).fill('item')}),{status:400});assert.equal((await service.get('checklist')).items.length,2);
});
test('timer deadline and checklist survive database restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'jarvis-widget-'));let repo=sqliteRepository(join(dir,'test.sqlite'));
 try{const service=widgetService(repo,()=>100000);await service.update('timer',{action:'start',minutes:1});await service.update('checklist',{action:'add',items:['Saved task']});repo.close();repo=sqliteRepository(join(dir,'test.sqlite'));
 const restored=widgetService(repo,()=>170000);assert.equal((await restored.get('timer')).status,'completed');assert.equal((await restored.get('checklist')).items[0].text,'Saved task');
 }finally{repo.close();rmSync(dir,{recursive:true,force:true});}
});
test('local widget commands distinguish opening from starting and ignore negations',()=>{
 assert.deepEqual(widgetRequest('hey Jarvis, start a 25-minute timer'),{kind:'timer',action:'start',minutes:25});
 assert.deepEqual(widgetRequest('start a pomodoro'),{kind:'timer',action:'start',minutes:25});
 assert.deepEqual(widgetRequest('open my checklist'),{kind:'checklist'});
 assert.deepEqual(widgetRequest('make a checklist: read notes, practice'),{kind:'checklist',action:'add',items:['read notes','practice']});
 assert.equal(widgetRequest("don't start a timer"),null);
 assert.deepEqual(widgetRequest('pause my timer'),{kind:'timer',action:'pause'});
 assert.deepEqual(widgetRequest('resume the timer'),{kind:'timer',action:'resume'});
});
test('widget API validates kinds and saves updates',async t=>{
 const app=createApp({repository:sqliteRepository(':memory:')});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));await app.locals.close();});
 const base=`http://127.0.0.1:${server.address().port}/api/widgets/`;
 assert.equal((await fetch(base+'other')).status,404);
 const response=await fetch(base+'checklist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'add',items:['API test']})});assert.equal(response.status,200);
 assert.equal((await (await fetch(base+'checklist')).json()).items[0].text,'API test');
});

test('opening a requested timer starts or resumes without resetting an existing countdown',async t=>{
 const f=fixture(t);
 let timer=await f.service.update('timer',{action:'ensure_running'});assert.equal(timer.status,'running');assert.equal(timer.minutes,25);
 const endsAt=timer.endsAt,revision=timer.revision;f.advance(10000);
 timer=await f.service.update('timer',{action:'ensure_running'});assert.equal(timer.endsAt,endsAt);assert.equal(timer.revision,revision);
 await f.service.update('timer',{action:'pause'});f.advance(20000);
 timer=await f.service.update('timer',{action:'ensure_running'});assert.equal(timer.status,'running');assert.equal(timer.remainingMs,1490000);assert.equal(timer.endsAt,endsAt+20000);
});

test('Jarvis starts the timer before opening its window, while manual opens and pause remain explicit',async t=>{
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push(JSON.parse(options.body).action);return new Response('{}',{headers:{'Content-Type':'application/json'}});});
 const surface={companionWindow:{widget:async kind=>calls.push('open:'+kind)}};
 await openWidget({kind:'timer',autoStart:true},surface);
 assert.deepEqual(calls,['ensure_running','open:timer']);calls.length=0;
 await openWidget({kind:'timer'},surface);
 assert.deepEqual(calls,['open:timer']);calls.length=0;
 await openWidget({kind:'timer',action:'pause',autoStart:true},surface);
 assert.deepEqual(calls,['pause','open:timer']);
});
