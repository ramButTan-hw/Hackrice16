import test from 'node:test';
import assert from 'node:assert/strict';
import {isBreakRequest} from '../src/break-request.js';
import {sqliteRepository} from '../server/repository.js';
import {createApp} from '../server/app.js';
import {generateReply} from '../server/chat.js';
test('explicit break requests end work, but questions and refusals do not',()=>{
  for(const text of ['I need to take a break',"I'm taking a break",'I want a break','Let’s take a break','Take a break please'])assert.equal(isBreakRequest(text),true,text);
  for(const text of ['Should I take a break?',"I don't need to take a break",'Maybe I need a break','I feel tired','If I need to take a break what happens?'])assert.equal(isBreakRequest(text),false,text);
});
test('break endpoint ends the session once, clears check-ins and rejects later samples',async t=>{
  const repository=sqliteRepository(':memory:');let now=100000;
  const app=createApp({repository,now:()=>now});const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await app.locals.close();await new Promise(resolve=>server.close(resolve));});
  const base='http://127.0.0.1:'+server.address().port;
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const session=await (await post('/api/sessions',{goal:'Study',source:'demo'})).json();
  now+=10000;
  const ended=await (await post('/api/sessions/'+session.id+'/end',{reason:'break'})).json();
  assert.equal(ended.status,'ended');assert.equal(ended.endReason,'break');assert.equal(ended.endedAt,now);
  now+=5000;
  const retry=await (await post('/api/sessions/'+session.id+'/end',{reason:'break'})).json();assert.equal(retry.endedAt,ended.endedAt);
  const sample=await post('/api/sessions/'+session.id+'/metrics',{timestamp:now,source:'demo',heartRate:80,breathingRate:15,quality:1});assert.equal(sample.status,409);
});
test('conversation after a break remains usable without mutating the ended session',async()=>{
  const reply=await generateReply({sessionId:'ended',memory:false,messages:[{role:'user',text:'I feel tired'}]},{apiKey:'test',sessions:{get:async()=>({status:'ended',endReason:'break',goal:'Study',source:'demo'}),state:async()=>({}),update:()=>assert.fail('must not write to an ended session')},fetcher:async()=>Response.json({candidates:[{content:{parts:[{functionCall:{name:'report_feeling',args:{feeling:'tired'}}}]}}]})});
  assert.match(reply.text,/break/);
});
