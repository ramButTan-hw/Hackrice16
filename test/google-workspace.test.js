import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {googleAuth,GOOGLE_SCOPES} from '../server/google-auth.js';
import {googleWorkspace,validateGoogleDraft} from '../server/google-workspace.js';
import {generateReply} from '../server/chat.js';

test('Google OAuth binds callback state, uses PKCE, and never exposes tokens',async()=>{
  let tokenBody;const auth=googleAuth({env:{GOOGLE_CLIENT_ID:'desktop-client',GOOGLE_CLIENT_SECRET:'secret',PORT:'3001'},fetcher:async(url,options)=>{
    if(url.endsWith('/token')){tokenBody=options.body;return Response.json({access_token:'access-secret',refresh_token:'refresh-secret',expires_in:3600,scope:GOOGLE_SCOPES.join(' ')});}
    return Response.json({sub:'user-1',email:'demo@example.com'});
  }});
  const url=new URL(auth.begin().url);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('redirect_uri'),'http://127.0.0.1:3001/oauth/google/callback');
  await assert.rejects(auth.callback({state:'wrong',code:'x'}),{status:400});
  const status=await auth.callback({state:url.searchParams.get('state'),code:'test-code'});
  assert.equal(status.connected,true);assert.ok(tokenBody.get('code_verifier'));assert.ok(!JSON.stringify(status).includes('secret'));
  await assert.rejects(auth.callback({state:url.searchParams.get('state'),code:'replay'}),{status:400});
  auth.disconnect();assert.equal(auth.status().connected,false);
});

test('embedded-server OAuth uses the bound port and preserves it for token exchange',async()=>{
  let port=54321,tokenBody;
  const auth=googleAuth({env:{GOOGLE_CLIENT_ID:'test-client',PORT:'3001'},getPort:()=>port,fetcher:async(url,options)=>{
    if(url.endsWith('/token')){tokenBody=options.body;return Response.json({access_token:'test',scope:GOOGLE_SCOPES.join(' ')});}
    return Response.json({sub:'test-user'});
  }});
  const url=new URL(auth.begin().url);
  assert.equal(url.searchParams.get('redirect_uri'),'http://127.0.0.1:54321/oauth/google/callback');
  port=54322;
  await auth.callback({state:url.searchParams.get('state'),code:'test-code'});
  assert.equal(tokenBody.get('redirect_uri'),url.searchParams.get('redirect_uri'));
});

async function fixture(t,{failUpdate=false}={}){
  const dir=await mkdtemp(join(tmpdir(),'jarvis-google-'));t.after(async()=>{assert.ok(resolve(dir).startsWith(resolve(tmpdir())));await rm(dir,{recursive:true,force:true});});
  let account='user-1';const calls=[];
  const auth={status:()=>({connected:true,accountId:account}),request:async(url,method='GET',body,owner,headers)=>{
    assert.equal(owner,account);calls.push({url,method,body,headers});
    if(url.includes('/drive/v3/files'))return {id:'doc-1'};
    if(url.endsWith(':batchUpdate')){if(failUpdate)throw new Error('connection lost');return {};}
    if(url.includes('/documents/'))return {revisionId:'revision-1'};
    if(url.endsWith('/calendars'))return {id:'calendar-1'};
    if(method==='GET')return {id:'event-1',etag:'version-1'};
    return {id:body?.id||'event-1',htmlLink:'https://calendar.google.com/calendar/event?eid=test'};
  }};
  return {workspace:googleWorkspace({auth,path:join(dir,'registry.json')}),calls,setAccount:value=>{account=value;}};
}
test('document preview makes no writes; duplicate confirmations create and fill exactly once',async t=>{
  const f=await fixture(t);const p=await f.workspace.propose({kind:'create_doc',title:'Study notes',content:'Key point\n☐ Review it',format:'checklist'},'conversation');
  assert.equal(f.calls.length,0);
  await assert.rejects(f.workspace.execute(p.id,'wrong-conversation'),{status:404});
  const [first,second]=await Promise.all([f.workspace.execute(p.id,'conversation'),f.workspace.execute(p.id,'conversation')]);
  assert.equal(first.status,'done');assert.deepEqual(first,second);assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
  assert.equal(f.calls.at(-1).body.writeControl.requiredRevisionId,'revision-1');
  assert.equal((await f.workspace.context()).documents[0].id,'doc-1');
});
test('append only targets known documents and uses a revision guard',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.workspace.propose({kind:'append_doc',title:'x',targetId:'other-document',content:'x'},'conversation'),{status:400});
  const p=await f.workspace.propose({kind:'create_doc',title:'Notes',content:'Original'},'conversation');await f.workspace.execute(p.id,'conversation');
  const append=await f.workspace.propose({kind:'append_doc',title:'ignored',targetId:'doc-1',content:'Additional point'},'conversation');await f.workspace.execute(append.id,'conversation');
  assert.equal(f.calls.filter(c=>c.url.includes('/drive/')).length,1);
  assert.equal(f.calls.at(-1).body.requests[0].insertText.text,'\nAdditional point\n');
});
test('uncertain writes are not blindly retried or labeled successful',async t=>{
  const f=await fixture(t,{failUpdate:true});const p=await f.workspace.propose({kind:'create_doc',title:'Notes',content:'Point'},'conversation');
  const result=await f.workspace.execute(p.id,'conversation');assert.equal(result.status,'uncertain');assert.match(result.result.url,/doc-1/);
  await assert.rejects(f.workspace.execute(p.id,'conversation'),{status:409});assert.equal(f.calls.filter(c=>c.url.endsWith(':batchUpdate')).length,1);
});
const event={kind:'create_event',title:'Review notes',start:'2026-09-13T16:00:00-05:00',end:'2026-09-13T16:30:00-05:00',timeZone:'America/Chicago'};
test('calendar work blocks use a dedicated calendar and stable IDs; rescheduling uses ETag',async t=>{
  const f=await fixture(t);const p=await f.workspace.propose(event,'conversation');const saved=await f.workspace.execute(p.id,'conversation');
  assert.match(saved.result.id,/^[0-9a-f]+$/);assert.equal(f.calls[0].body.summary,'Acumen work sessions');
  const p2=await f.workspace.propose({...event,kind:'reschedule_event',targetId:saved.result.id,start:'2026-09-13T17:00:00-05:00',end:'2026-09-13T17:30:00-05:00'},'conversation');await f.workspace.execute(p2.id,'conversation');
  assert.equal(f.calls.filter(c=>c.url.endsWith('/calendars')).length,1);assert.equal(f.calls.at(-1).headers['If-Match'],'version-1');
});
test('preview is rejected after account changes and invalid event times never reach Google',async t=>{
  const f=await fixture(t);const p=await f.workspace.propose(event,'conversation');f.setAccount('user-2');
  await assert.rejects(f.workspace.execute(p.id,'conversation'),{status:409});assert.equal(f.calls.length,0);
  assert.throws(()=>validateGoogleDraft({...event,end:event.start}),/valid work block/);
  assert.throws(()=>validateGoogleDraft({...event,start:'tomorrow'}),/valid work block/);
});
test('Gemini screen-to-checklist tool produces a preview without any Google write',async t=>{
  const f=await fixture(t);const reply=await generateReply({conversationId:'conversation',memory:false,screenshot:'YWJj',messages:[{role:'user',text:'Turn this screen into a checklist'}]},{apiKey:'test',workspace:f.workspace,onText:()=>{},fetcher:async(_url,options)=>{
    const body=JSON.parse(options.body);assert.equal(body.contents[0].parts[1].inlineData.data,'YWJj');assert.ok(body.tools[0].functionDeclarations.some(t=>t.name==='prepare_google_action'));
    return new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{functionCall:{name:'prepare_google_action',args:{kind:'create_doc',title:'Checklist',format:'checklist',content:'☐ Read the prompt\n☐ Solve the exercise'}}}]}}]})+'\n\n');
  }});
  assert.equal(reply.proposals.length,1);assert.match(reply.text,/preview/);assert.equal(f.calls.length,0);
});
