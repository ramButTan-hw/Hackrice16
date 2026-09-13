import test from 'node:test';
import assert from 'node:assert/strict';
import {websiteRequest,websiteUrl} from '../shared/website-request.js';
import {openWebsite} from '../src/website-request.js';
test('spoken or typed website requests normalize to real URLs',()=>{
 for(const text of ['hey jarvis can you open roblox.com','Jarvis, open roblox dot com please','open Roblox','can you open roblox.com in my browser?'])assert.equal(websiteRequest(text),'https://roblox.com/',text);
 assert.equal(websiteRequest('open https://example.com/path?q=one'),'https://example.com/path?q=one');
 for(const text of ["don't open roblox.com",'what is roblox.com','open my planner','open file:///tmp/test','open javascript:alert(1)','open example.com and delete my account'])assert.equal(websiteRequest(text),null,text);
});
test('only website URLs reach the native shell bridge',async()=>{
 let received;await openWebsite('roblox.com',{helpPanel:{openWebsite:async url=>{received=url;}}});assert.equal(received,'https://roblox.com/');
 for(const url of ['file:///etc/passwd','javascript:alert(1)','mailto:user@example.com','https://user:pass@example.com','https://example.com\\evil'])assert.throws(()=>websiteUrl(url));
 await assert.rejects(openWebsite('example.com',{helpBridge:{openWebsite:async()=>{throw new Error('browser failed');}}}),/browser failed/);
});
