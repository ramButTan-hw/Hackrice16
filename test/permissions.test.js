import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createPermissions,installMediaPermissions}=createRequire(import.meta.url)('../electron/permissions.cjs');
function setup(initial={}){
  const states={camera:'not-determined',microphone:'not-determined',screen:'not-determined',accessibility:'denied',...initial};
  const calls=[],accessibilityQueries=[];
  const permissions=createPermissions({platform:'darwin',systemPreferences:{getMediaAccessStatus:kind=>states[kind],isTrustedAccessibilityClient(prompt){accessibilityQueries.push(prompt);return states.accessibility==='granted';},async askForMediaAccess(kind){calls.push(kind);await Promise.resolve();states[kind]='granted';return true;}},shell:{async openExternal(url){calls.push(url);}},desktopCapturer:{async getSources(){calls.push('capture');states.screen='granted';return [];}}});
  return {states,calls,permissions,accessibilityQueries};
}
test('Accessibility readiness reads never prompt and the settings action opens its own pane',async()=>{
  const {states,calls,permissions,accessibilityQueries}=setup();
  assert.equal(permissions.status().accessibility,'denied');
  assert.deepEqual(accessibilityQueries,[false]);assert.deepEqual(calls,[]);
  assert.equal(await permissions.request('accessibility'),'denied');
  await permissions.openSettings('accessibility');
  assert.deepEqual(calls,['x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility']);
  states.accessibility='granted';assert.equal(permissions.status().accessibility,'granted');
  assert.ok(accessibilityQueries.every(value=>value===false));
});
test('unavailable and non-macOS Accessibility checks remain unknown without prompting',async()=>{
  for(const platform of ['darwin','win32','linux']){
    const preferences={getMediaAccessStatus:()=> 'unknown',...(platform!=='darwin'?{isTrustedAccessibilityClient(){throw new Error('macOS only');}}:{})};
    const permissions=createPermissions({platform,systemPreferences:preferences});
    assert.equal(permissions.status().accessibility,'unknown');
    assert.equal(await permissions.request('accessibility'),'unknown');
  }
});
test('macOS requests only the needed device and coalesces simultaneous prompts',async()=>{
  const {permissions,calls}=setup();
  await Promise.all([permissions.ensure('camera'),permissions.ensure('camera')]);
  assert.deepEqual(calls,['camera']);
  assert.equal(permissions.status().microphone,'not-determined');
  await permissions.ensure('camera');assert.equal(calls.length,1);
});
test('denied/restricted microphone does not reprompt and explains recovery',async()=>{
  for(const state of ['denied','restricted']){
    const {permissions,calls}=setup({microphone:state});
    await assert.rejects(permissions.ensure('microphone'),/Open Settings/);
    assert.deepEqual(calls,[]);
    await permissions.openSettings('microphone');
    assert.equal(calls[0],'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
  }
});
test('screen permission uses capture even when macOS initially reports denied',async()=>{
  const {permissions,calls}=setup({screen:'denied'});
  await permissions.ensure('screen');assert.deepEqual(calls,['capture']);
  await permissions.ensure('screen');assert.equal(calls.length,1);
});
test('settings accepts only known permission kinds',async()=>{
  const {permissions,calls}=setup();
  await assert.rejects(permissions.openSettings('https://example.com'),/Invalid/);assert.deepEqual(calls,[]);
});
test('non-macOS paths never call macOS prompt APIs',async()=>{
  const permissions=createPermissions({platform:'linux'});
  await permissions.ensure('camera');assert.equal(permissions.status().platform,'linux');
});
test('Windows does not apply macOS denial logic to desktop microphone access',async()=>{
  const permissions=createPermissions({platform:'win32',systemPreferences:{getMediaAccessStatus:()=> 'denied',askForMediaAccess(){throw new Error('macOS only');}}});
  await permissions.ensure('microphone');
});
test('both approved main and companion windows can request microphone access',async()=>{
  let request;const main={getURL:()=> 'http://127.0.0.1:54321/'},panel={getURL:()=> 'http://127.0.0.1:54321/?help-window=1'};
  const allowed=[main,panel],calls=[];
  installMediaPermissions({setPermissionCheckHandler(){},setPermissionRequestHandler(fn){request=fn;}},{origin:'http://127.0.0.1:54321',allowedContents:wc=>allowed.includes(wc),permissions:{async ensure(kind){calls.push(kind);}}});
  for(const wc of allowed)assert.equal(await new Promise(resolve=>request(wc,'media',resolve,{requestingUrl:wc.getURL(),isMainFrame:true,mediaTypes:['audio']})),true);
  assert.deepEqual(calls,['microphone','microphone']);
});
test('permission handlers deny external pages, iframes, other windows and unrelated APIs',async()=>{
  let check,request;const calls=[];
  const owner={getURL:()=> 'http://127.0.0.1:54321/'};
  installMediaPermissions({setPermissionCheckHandler(fn){check=fn;},setPermissionRequestHandler(fn){request=fn;}},{origin:'http://127.0.0.1:54321',allowedContents:wc=>wc===owner,permissions:{async ensure(kind){calls.push(kind);}}});
  const details={requestingUrl:owner.getURL(),isMainFrame:true,mediaTypes:['audio','video']};
  const ask=(wc,permission,data)=>new Promise(resolve=>request(wc,permission,resolve,data));
  assert.equal(check(owner,'media',owner.getURL(),{isMainFrame:true}),true);
  assert.equal(check(owner,'media','https://evil.test',{}),false);
  assert.equal(await ask(owner,'media',details),true);assert.deepEqual(calls,['microphone','camera']);
  for(const [wc,permission,data] of [[owner,'geolocation',details],[{},'media',details],[owner,'media',{...details,isMainFrame:false}],[owner,'media',{...details,requestingUrl:'https://evil.test'}],[owner,'media',{...details,mediaTypes:['unknown']}]])assert.equal(await ask(wc,permission,data),false);
  assert.equal(calls.length,2);
});
test('OS denial propagates as a rejected renderer permission',async()=>{
  let request;const owner={getURL:()=> 'http://127.0.0.1:54321/'};
  installMediaPermissions({setPermissionCheckHandler(){},setPermissionRequestHandler(fn){request=fn;}},{origin:'http://127.0.0.1:54321',allowedContents:()=>true,permissions:{async ensure(){throw new Error('denied');}}});
  assert.equal(await new Promise(resolve=>request(owner,'media',resolve,{requestingUrl:owner.getURL(),mediaTypes:['audio']})),false);
});
