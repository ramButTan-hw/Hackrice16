import test from 'node:test';
import assert from 'node:assert/strict';
import {endSessionOnClose,finishSessionAndStop} from '../electron/end-session.cjs';
import {createApp} from '../server/app.js';
import {sqliteRepository} from '../server/repository.js';

test('closing ends only the tracked session and repeating close preserves its end time',async t=>{
  let time=10000;
  const app=createApp({repository:sqliteRepository(':memory:'),now:()=>time});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await app.locals.close();await new Promise(resolve=>server.close(resolve));});
  const base='http://127.0.0.1:'+server.address().port;
  const start=()=>fetch(base+'/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({goal:'Close test',source:'demo'})}).then(r=>r.json());
  const tracked=await start(),other=await start();time=20000;
  await endSessionOnClose(base,tracked.id);time=30000;await endSessionOnClose(base,tracked.id);
  const saved=await fetch(base+'/api/sessions/'+tracked.id).then(r=>r.json());
  assert.equal(saved.status,'ended');assert.equal(saved.endedAt,20000);
  assert.equal((await fetch(base+'/api/sessions/'+other.id).then(r=>r.json())).status,'active');
});
test('missing session skips network; failed persistence prevents successful shutdown',async()=>{
  await endSessionOnClose('http://localhost',null,{fetcher:()=>{throw new Error('Should not fetch');}});
  await assert.rejects(endSessionOnClose('http://localhost','id',{fetcher:async()=>new Response('',{status:503})}),/Could not save/);
  await assert.rejects(endSessionOnClose('http://localhost','id',{fetcher:async(url)=>url.endsWith('/end')?new Response('',{status:409}):Response.json({status:'active'})}),/Could not save/);
});

test('session end is saved before a stalled native stop, and shutdown remains bounded',async()=>{
  const order=[];
  await finishSessionAndStop('http://localhost','test',{cleanupMs:10,fetcher:async()=>{order.push('saved');return Response.json({status:'ended'});},stop:()=>{order.push('native-stop');return new Promise(()=>{});}});
  assert.deepEqual(order,['saved','native-stop']);
});
