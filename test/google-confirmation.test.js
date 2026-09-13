import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareGoogleConfirmation} from '../src/google-confirmation.js';
test('confirm opens sign-in when disconnected without attempting a save',async()=>{
 const calls=[];let opened;
 const result=await prepareGoogleConfirmation({fetcher:async(url,options)=>{calls.push([url,options?.method]);return Response.json(url.endsWith('/status')?{connected:false}:{url:'https://accounts.google.com/o/oauth2/auth'});},open:async url=>opened=url});
 assert.equal(result.ready,false);assert.equal(result.opened,true);assert.equal(opened,'https://accounts.google.com/o/oauth2/auth');assert.deepEqual(calls.map(c=>c[0]),['/api/google/status','/api/google/connect']);
});
test('connected confirmation proceeds and pending sign-in is not reopened',async()=>{
 for(const connected of [true,false]){
  let requests=0;const result=await prepareGoogleConfirmation({connecting:true,fetcher:async()=>{requests++;return Response.json({connected});},open:assert.fail});
  assert.equal(result.ready,connected);assert.equal(requests,1);
 }
});
test('connection launch failure is surfaced rather than pretending sign-in opened',async()=>{
 await assert.rejects(prepareGoogleConfirmation({fetcher:async url=>Response.json(url.endsWith('/status')?{connected:false}:{url:'https://accounts.google.com/'}),open:async()=>{throw new Error('Browser could not open');}}),/Browser could not open/);
});
