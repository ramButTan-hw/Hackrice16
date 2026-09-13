import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {googleLink,openGoogleLink}=createRequire(import.meta.url)('../electron/google-links.cjs');
test('Google links support actual Calendar event htmlLink plus Docs, Slides and OAuth',()=>{
  for(const url of ['https://www.google.com/calendar/event?eid=example','https://calendar.google.com/calendar/u/0/r','https://docs.google.com/document/d/doc-id/edit','https://docs.google.com/presentation/d/slides-id/edit','https://accounts.google.com/o/oauth2/v2/auth?client_id=example'])assert.equal(googleLink(url),url);
});
test('Google opener rejects unrelated destinations and credential/port tricks',()=>{
  for(const url of ['https://www.google.com/url?q=https://example.com','https://www.google.com/calendar/event/redirect','https://calendar.google.com.evil.example/calendar/event','https://docs.google.com.evil.example/document/d/id','https://user:password@docs.google.com/document/d/id','http://calendar.google.com/calendar/event','https://calendar.google.com:8443/calendar/event','file:///tmp/test','javascript:alert(1)','not a URL'])assert.throws(()=>googleLink(url),/Google link|Only Google/);
});
test('macOS opens the Google Calendar event URL in the foreground browser',async()=>{
  const calls=[];const url='https://www.google.com/calendar/event?eid=test';
  await openGoogleLink(url,{openExternal:async(...args)=>calls.push(args)});
  assert.deepEqual(calls,[[url,{activate:true}]]);
});
test('browser launch failures produce a visible actionable error and invalid links never launch',async()=>{
  await assert.rejects(openGoogleLink('https://www.google.com/calendar/event?eid=test',{openExternal:async()=>{throw new Error('private OS detail');}}),/copy the Google link/);
  await assert.rejects(openGoogleLink('https://evil.example',{openExternal:()=>assert.fail('must not launch')}),/Only Google/);
});
