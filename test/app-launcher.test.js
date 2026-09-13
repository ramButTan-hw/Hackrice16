import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {appRequest} from '../shared/app-request.js';
import {websiteRequest} from '../shared/website-request.js';
const {createAppLauncher}=createRequire(import.meta.url)('../electron/app-launcher.cjs');
test('website names stay websites and explicit app names are recognized',()=>{
 assert.equal(websiteRequest('open Google'),'https://google.com/');assert.equal(websiteRequest('open the Google website'),'https://google.com/');
 assert.equal(websiteRequest('open Google Chrome'),null);assert.equal(appRequest('open the Spotify app'),'Spotify');
 for(const text of ['open /tmp/evil.app','open Safari and run a command','do not open Safari','open my planner','start a timer'])assert.equal(appRequest(text),null);
});
test('launcher resolves installed bundles and passes literal arguments without a shell',async()=>{
 const calls=[];const launch=createAppLauncher({home:'/Users/test',platform:'darwin',readDirectory:async root=>root==='/Applications'?[{name:'Google Chrome.app',isDirectory:()=>true}]:[],run:async(...args)=>calls.push(args)});
 assert.deepEqual(await launch('Chrome'),{name:'Google Chrome'});assert.deepEqual(calls[0].slice(0,2),['/usr/bin/open',['-a','/Applications/Google Chrome.app']]);
 await assert.rejects(launch('Not Installed'),/couldn’t find/);
 for(const value of ['/tmp/evil.app','Safari; touch x','-a Safari'])await assert.rejects(launch(value));
 assert.equal(calls.length,1);
});
