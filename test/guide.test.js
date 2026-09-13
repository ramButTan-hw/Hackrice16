import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {guideStep} from '../server/guide.js';
import {guideRequest} from '../src/guide-request.js';
const require=createRequire(import.meta.url);
const {validateStep,screenPoint,assertFresh}=require('../shared/guide-step.cjs');
const {createGuide}=require('../electron/guide.cjs');
const click={action:'click',instruction:'Open the search box.',target:'Search',x:.25,y:.5};
test('guidance parses explicit requests and leaves unrelated requests alone',()=>{
 assert.deepEqual(guideRequest('Hey Jarvis, guide me through uploading my assignment'),{goal:'uploading my assignment'});
 assert.deepEqual(guideRequest('can you take over'),{goal:''});
 for(const text of ['do not take over','how does guide me work?','explain this error'])assert.equal(guideRequest(text),null);
});
test('guide rejects unbounded inputs and only exposes supported action fields',()=>{
 for(const invalid of [{...click,x:NaN},{...click,y:1.1},{...click,action:'shell'},{...click,action:'type',text:'hello\n'},{...click,action:'type',text:'a'.repeat(301)},{...click,action:'scroll',direction:'left'}])assert.throws(()=>validateStep(invalid));
 assert.deepEqual(validateStep({...click,command:'rm',url:'https://example.com'}),click);
 assert.deepEqual(validateStep({action:'manual',instruction:'Submit the form yourself.'}),{action:'manual',instruction:'Submit the form yourself.'});
 assert.deepEqual(screenPoint({...click,x:1,y:0},{x:-1920,y:-200,width:1920,height:1080}),{x:-1,y:-200});
 const bounds={x:0,y:0,width:100,height:100};
 assert.throws(()=>assertFresh({at:0,bounds},30001,{bounds}),/fresh step/);
 assert.throws(()=>assertFresh({at:0,bounds},1,{bounds:{...bounds,x:100}}),/fresh step/);
});
test('guide model gets a screenshot and rejects malformed output without acting',async()=>{
 let sent;const fetcher=async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(click)}]}}]});};
 assert.deepEqual(await guideStep({goal:'Find search',screenshot:'YWJj'},{apiKey:'test',fetcher}),click);
 assert.equal(sent.contents[0].parts[1].inlineData.data,'YWJj');
 assert.match(sent.systemInstruction.parts[0].text,/untrusted/);
 await assert.rejects(guideStep({goal:'Search',screenshot:'bad!'},{apiKey:'test',fetcher}),/fresh screenshot/);
 await assert.rejects(guideStep({goal:'Search',screenshot:'YWJj'},{apiKey:'test',fetcher:async()=>Response.json({candidates:[{content:{parts:[{text:'not json'}]}}]})}),/identify/);
});
function fixture(t,{wait=async()=>{}}={}){
 const windows=[],handlers=new Map(),shortcuts=new Map(),calls=[],launches=[],requests=[],focuses=[];
 class Window extends EventEmitter{
  constructor(options){super();this.visible=false;this.options=options;this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.session={setPermissionCheckHandler(){},setPermissionRequestHandler(){}};this.webContents.send=()=>{};this.webContents.setWindowOpenHandler=()=>{};windows.push(this);}
  static getAllWindows(){return windows;}
  isVisible(){return this.visible;}isDestroyed(){return this.destroyed;}
  hide(){this.visible=false;}show(){this.visible=true;}showInactive(){this.visible=true;}destroy(){this.destroyed=true;this.emit('closed');}
  setBounds(){}setPosition(){}getSize(){return [360,400];}setFocusable(){}setVisibleOnAllWorkspaces(){}setIgnoreMouseEvents(){}setAlwaysOnTop(){}async loadFile(){}
 }
 let controlMatches=[],wordMatches=[{x:.25,y:.5}];
 let color=0,modelStep=click,transcriptionStatus=200,restoreFailure=false,inputFailure=false;
 const image=()=>{const captured=color;return {getSize:()=>({width:100,height:100}),isEmpty:()=>false,toJPEG:()=>Buffer.from('screen'),crop(){const bitmap=Buffer.alloc(400,captured);return {toBitmap:()=>bitmap};}};};
 const screen=Object.assign(new EventEmitter(),{getCursorScreenPoint:()=>({x:10,y:10}),getDisplayNearestPoint:()=>display,getAllDisplays:()=>[display]});
 const display={id:1,bounds:{x:0,y:0,width:1000,height:800},workArea:{x:0,y:0,width:1000,height:800}};
 const app=new EventEmitter();
 const guide=createGuide({app,BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},screen,desktopCapturer:{getSources:async()=>[{display_id:'1',thumbnail:image()}]},globalShortcut:{register:(key,fn)=>{shortcuts.set(key,fn);return true;},unregister:key=>shortcuts.delete(key)},systemPreferences:{},shell:{},permissions:{ensure:async()=>{}},authorize:()=>{},launchTarget:async step=>{launches.push(step);return {name:step.name||new URL(step.url).hostname};},apiUrl:()=>'',fetcher:async(url,options)=>{requests.push(JSON.parse(url.endsWith('/api/transcribe')?'{}':options.body));return url.endsWith('/api/transcribe')?Response.json(transcriptionStatus===200?{text:'I did it'}:{error:'No speech recognized.'},{status:transcriptionStatus}):Response.json(Array.isArray(modelStep)?modelStep.shift():modelStep);},inputDriver:{run:async action=>{if(action.action==='locate_control')return {matches:controlMatches};if(action.action==='locate_word')return {matches:wordMatches};if(action.action==='status')return {pid:123,trusted:true};if(action.action==='restore'){focuses.push(action);if(restoreFailure)throw new Error('The active app changed. Get a fresh step.');return {ok:true};}calls.push(action);if(inputFailure)throw new Error('macOS is blocking mouse and keyboard input.');return {ok:true};},stop:()=>calls.push('stop')},wait});
 t.after(()=>guide.stop());
 const invoke=(name,...args)=>{const sender=windows[0]?.webContents;return handlers.get(name.startsWith('music:')?name:'guide:'+name)({sender,senderFrame:sender?.mainFrame},...args);};
 return {invoke,calls,launches,requests,focuses,controls:matches=>controlMatches=matches,words:matches=>wordMatches=matches,failRestore:()=>restoreFailure=true,failInput:()=>inputFailure=true,shortcuts,transcription:status=>transcriptionStatus=status,changeScreen:()=>color=200,model:step=>modelStep=step};
}
test('guide executes only one approved step and rejects repeated or stale screen actions',async t=>{
 const f=fixture(t);await f.invoke('open','Find search');await f.invoke('next','Find search');assert.equal(f.calls.length,0);
 await f.invoke('execute');assert.equal(f.calls.length,1);assert.equal(f.calls[0].action,'click');
 await assert.rejects(f.invoke('execute'),/fresh step/);
 await f.invoke('next','Find search');f.changeScreen();const state=await f.invoke('execute');assert.match(state.error,/target moved/);assert.equal(f.calls.length,1);
});
test('manual steps cannot execute and Escape discards pending approval',async t=>{
 const f=fixture(t);await f.invoke('open','Submit assignment');f.model({action:'manual',instruction:'Submit the assignment yourself.'});await f.invoke('next','Submit assignment');
 await assert.rejects(f.invoke('execute'),/fresh step/);
 f.model(click);await f.invoke('next','Find search');f.shortcuts.get('Escape')();
 assert.deepEqual(f.calls,['stop']);assert.throws(()=>f.invoke('execute'),/guide window/);
});
test('guidance retries a missing model with the configured fallback',async()=>{
 const urls=[];
 const step=await guideStep({goal:'Find search',screenshot:'YWJj'},{apiKey:'test',model:'missing-model',fetcher:async url=>{urls.push(url);return urls.length===1?new Response('',{status:404}):Response.json({candidates:[{content:{parts:[{text:JSON.stringify(click)}]}}]});}});
 assert.deepEqual(step,click);assert.equal(urls.length,2);assert.notEqual(urls[0],urls[1]);
});
test('start and next voice commands do not approve desktop input',async t=>{
 const f=fixture(t);await f.invoke('open','Find search');
 const initial=await f.invoke('ready');
 const started=await f.invoke('voice',"let's start",initial.voiceEpoch);
 assert.equal(started.started,true);assert.equal(f.calls.length,0);
 const repeated=await f.invoke('voice','I did it',initial.voiceEpoch);
 assert.match(repeated.voiceMessage,/say it again/);assert.equal(repeated.voiceEpoch,started.voiceEpoch);
 const next=await f.invoke('voice','I did it',started.voiceEpoch);
 assert.ok(next.voiceEpoch>started.voiceEpoch);assert.equal(f.calls.length,0);
 const refused=await f.invoke('voice','approve',next.voiceEpoch);
 assert.equal(refused.lastReply,'approve');assert.equal(f.calls.length,0);
 await f.invoke('voice','stop the guide',-1);assert.deepEqual(f.calls,['stop']);
});
test('voice can set a task before starting and cannot advance an empty task',async t=>{
 const f=fixture(t);await f.invoke('open','');const initial=await f.invoke('ready');
 assert.match((await f.invoke('voice','lets start',initial.voiceEpoch)).voiceMessage,/task/);
 const task=await f.invoke('voice','my task is find my assignment',initial.voiceEpoch);
 assert.equal(task.goal,'find my assignment');
 assert.equal((await f.invoke('voice','lets start',task.voiceEpoch)).started,true);
});

test('empty transcription is a recoverable result and releases the next recording',async t=>{
 const f=fixture(t);await f.invoke('open','Find search');f.transcription(422);
 assert.deepEqual(await f.invoke('transcribe',new ArrayBuffer(100)),{text:'',noSpeech:true});
 f.transcription(200);assert.deepEqual(await f.invoke('transcribe',new ArrayBuffer(100)),{text:'I did it'});
 assert.equal(f.calls.length,0);
});

test('guide voice opens named websites and apps without executing a screen click',async t=>{
 const f=fixture(t);await f.invoke('open','Create a Google Doc');let state=await f.invoke('ready');
 state=await f.invoke('voice','open Google',state.voiceEpoch);assert.equal(f.launches[0].url,'https://google.com/');assert.equal(state.goal,'Create a Google Doc');
 await f.invoke('voice','open Safari',state.voiceEpoch);assert.equal(f.launches[1].name,'Safari');assert.equal(f.calls.length,0);
});
test('a proposed website navigation opens only after approval',async t=>{
 const f=fixture(t);await f.invoke('open','Create a Google Doc');f.model({action:'open_website',url:'https://docs.google.com/',instruction:'Open Google Docs to create your document.'});
 await f.invoke('next','Create a Google Doc');assert.equal(f.launches.length,0);await f.invoke('execute');assert.equal(f.launches.length,1);await assert.rejects(f.invoke('execute'),/fresh step/);
});
test('takeover performs a step, checks the screen, and pauses at a manual step',async t=>{
 const f=fixture(t);await f.invoke('open','Find search');f.model([click,{action:'manual',instruction:'Enter your password yourself.'}]);
 await f.invoke('next','Find search');const state=await f.invoke('ready');await f.invoke('voice','do it for me',state.voiceEpoch);
 await new Promise(resolve=>setImmediate(resolve));
 const result=await f.invoke('ready');assert.equal(f.calls.length,1);assert.equal(result.takeover,false);assert.equal(result.step.action,'manual');assert.match(result.takeoverMessage,/Your turn/);
});
test('takeover pauses on a repeated suggestion instead of clicking indefinitely',async t=>{
 const f=fixture(t);await f.invoke('open','Find search');await f.invoke('next','Find search');await f.invoke('takeover');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.calls.length,1);assert.match((await f.invoke('ready')).takeoverMessage,/repeating/);
});
test('Stop cancels takeover during its action preview',async t=>{
 let release;const f=fixture(t,{wait:ms=>ms===1000?new Promise(resolve=>release=resolve):Promise.resolve()});await f.invoke('open','Find search');await f.invoke('next','Find search');
 await f.invoke('takeover');await f.invoke('voice','stop the guide',-1);release();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.calls,['stop']);
});
test('takeover stops after eight actions and checks the final screen',async t=>{
 const f=fixture(t);await f.invoke('open','Find search');f.model(Array.from({length:9},(_,i)=>({...click,target:'Search '+i})));
 await f.invoke('next','Find search');await f.invoke('takeover');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.calls.length,8);const result=await f.invoke('ready');assert.equal(result.takeover,false);assert.equal(result.step.target,'Search 8');assert.match(result.takeoverMessage,/8 steps/);
});
test('guide repairs a bundled manual compose-and-send response into a draft step',async()=>{
 const draft={action:'type',instruction:'Draft Hi in the message composer.',target:'Message #general',x:.5,y:.9,text:'Hi'};
 const responses=[{action:'manual',instruction:'Click Message #general, type Hi, and press Enter to send.'},draft];const requests=[];
 const result=await guideStep({goal:'Send Hi in general',screenshot:'YWJj'},{apiKey:'test',fetcher:async(_url,options)=>{requests.push(JSON.parse(options.body));return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(responses.shift())}]}}]});}});
 assert.deepEqual(result,draft);assert.equal(requests.length,2);assert.match(requests[1].contents.at(-1).parts[0].text,/Do not send or submit/);
});
test('a final-send-only handoff is not rewritten into another draft',async()=>{
 let count=0;const step={action:'manual',instruction:'Your draft is ready. Press Send when you are ready.'};
 assert.deepEqual(await guideStep({goal:'Send Hi in general',screenshot:'YWJj'},{apiKey:'test',fetcher:async()=>{count++;return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(step)}]}}]});}}),step);
 assert.equal(count,1);
});
test('takeover drafts the requested message and stops before sending',async t=>{
 const f=fixture(t);await f.invoke('open','Send Hi in general');f.model([{action:'type',instruction:'Draft Hi.',target:'Message #general',x:.5,y:.9,text:'Hi'},{action:'manual',instruction:'Hi is drafted. Press Send yourself.'}]);
 await f.invoke('next','Send Hi in general');await f.invoke('takeover');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].action,'type');assert.equal(f.calls[0].text,'Hi');assert.equal((await f.invoke('ready')).takeover,false);
});
test('free-form voice answers carry the guide question and do not execute input',async t=>{
 const f=fixture(t);await f.invoke('open','Help with this repository');f.model({action:'manual',instruction:'Do you want to build the project or add a README?'});await f.invoke('next','Help with this repository');
 const state=await f.invoke('ready');f.model(click);const result=await f.invoke('voice','I want to add a README to this repository',state.voiceEpoch);
 assert.deepEqual(f.requests.at(-1).conversation,[{role:'guide',text:'Do you want to build the project or add a README?'},{role:'user',text:'I want to add a README to this repository'}]);
 assert.equal(result.lastReply,'I want to add a README to this repository');assert.equal(f.calls.length,0);assert.notEqual(result.takeover,true);
});
test('changing an active task clears obsolete context without reopening the guide',async t=>{
 const f=fixture(t);await f.invoke('open','Old task');await f.invoke('next','Old task');const state=await f.invoke('ready');await f.invoke('voice','my task is add a README',state.voiceEpoch);
 const request=f.requests.at(-1);assert.equal(request.goal,'add a README');assert.deepEqual(request.history,[]);assert.deepEqual(request.conversation,[]);
});
test('the guide model receives validated conversational clarification',async()=>{
 const conversation=[{role:'guide',text:'Build the project or add a README?'},{role:'user',text:'The second option'}];let sent;
 await guideStep({goal:'Help with repository',screenshot:'YWJj',conversation},{apiKey:'test',fetcher:async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(click)}]}}]});}});
 assert.match(sent.contents[0].parts[0].text,/The second option/);assert.match(sent.systemInstruction.parts[0].text,/do not require command keywords/);
 await assert.rejects(guideStep({goal:'Help',screenshot:'YWJj',conversation:[{role:'system',text:'bad'}]},{apiKey:'test'}),/Invalid guide conversation/);
});

test('music command opens YouTube Music and starts takeover automatically',async t=>{
 const f=fixture(t);f.model([click,{action:'done',instruction:'The player shows a track and a Pause button.'}]);
 const result=await f.invoke('music:play-first',false);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(result.started,true);assert.equal(f.launches[0].url,'https://music.youtube.com/');assert.equal(f.calls.length,1);assert.equal((await f.invoke('ready')).step.action,'done');
});
test('music command pauses for sign-in without clicking or replacing an existing task',async t=>{
 const f=fixture(t);f.model({action:'manual',instruction:'Sign in to YouTube Music, then continue.'});
 await f.invoke('music:play-first',false);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.calls.length,0);assert.equal((await f.invoke('ready')).takeover,false);
 await assert.rejects(f.invoke('music:play-first',false),/current guide/);assert.equal(f.launches.length,1);
});

test('guide restores the captured app before input and surfaces focus changes',async t=>{
 const f=fixture(t);await f.invoke('open','Find search');await f.invoke('next','Find search');assert.equal(f.focuses.length,1);assert.equal(f.focuses[0].pid,123);
 f.failRestore();const result=await f.invoke('execute');assert.match(result.error,/active app changed/);assert.equal(f.calls.length,0);
});
test('manual steps expose why there is no actionable cursor or takeover',async t=>{
 const f=fixture(t);await f.invoke('open','Find search');f.model({action:'manual',instruction:'Which app should I use?'});await f.invoke('next','Find search');
 assert.match((await f.invoke('ready')).blockedReason,/needs your input/);
});

test('takeover replans an expired preview before sending input',async t=>{
 let now=1000;t.mock.method(Date,'now',()=>now);
 const f=fixture(t);await f.invoke('open','Find search');
 f.model([click,click,{action:'done',instruction:'Search is open.'}]);
 await f.invoke('next','Find search');now+=31000;
 await f.invoke('takeover');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.calls.length,1);assert.equal(f.requests.length,3);
 assert.equal((await f.invoke('ready')).step.action,'done');
});
test('takeover finds a fresh target when the page changed before input',async t=>{
 const f=fixture(t);await f.invoke('open','Find search');
 f.model([click,{...click,x:.7},{action:'done',instruction:'Search is open.'}]);
 await f.invoke('next','Find search');f.changeScreen();
 await f.invoke('takeover');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].x,700);
 assert.equal((await f.invoke('ready')).step.action,'done');
});
test('takeover reports native input failure and never automatically retries it',async t=>{
 const f=fixture(t);await f.invoke('open','Find search');await f.invoke('next','Find search');f.failInput();
 await f.invoke('takeover');await new Promise(resolve=>setImmediate(resolve));
 const state=await f.invoke('ready');assert.match(state.takeoverMessage,/macOS is blocking/);
 assert.equal(f.calls.length,1);assert.equal(f.requests.length,1);assert.equal(state.takeover,false);
});
test('takeover stops refreshing if a replacement preview also expires',async t=>{
 let now=1000;t.mock.method(Date,'now',()=>now);
 const f=fixture(t,{wait:async ms=>{if(ms===1000)now+=31000;}});
 await f.invoke('open','Find search');await f.invoke('next','Find search');await f.invoke('takeover');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.calls.length,0);assert.equal(f.requests.length,2);
 assert.equal((await f.invoke('ready')).takeover,false);
});

test('formatting handoffs are repaired into one visible word-selection step',async()=>{
 const selection={...click,action:'double_click',target:'Animals',instruction:'Select the word Animals.'};
 const replies=[{action:'manual',instruction:"Highlight the word Animals, then click Text color in the toolbar and choose Red."},selection];
 const requests=[];
 const result=await guideStep({goal:'Make Animals red',screenshot:'YWJj',takeover:true},{apiKey:'test',fetcher:async(_url,options)=>{
  requests.push(JSON.parse(options.body));return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(replies.shift())}]}}]});
 }});
 assert.deepEqual(result,selection);assert.equal(requests.length,2);
 assert.match(requests[0].contents[0].parts[0].text,/Takeover requested/);
 assert.match(requests[1].contents.at(-1).parts[0].text,/double_click/);
});
test('takeover replans a manual formatting instruction and executes selection and color steps',async t=>{
 const f=fixture(t);await f.invoke('open','Make Animals red');
 f.model([{action:'manual',instruction:'Select Animals, then change its text color to red.'},
  {...click,action:'double_click',target:'Animals'},
  {...click,target:'Text color'}, {...click,target:'Red'},
  {action:'done',instruction:'Animals is visibly red.'}]);
 await f.invoke('next','Make Animals red');assert.equal(f.calls.length,0);
 await f.invoke('takeover');await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(f.calls.map(c=>c.action),['double_click','click','click']);
 assert.equal(f.requests[1].takeover,true);
 assert.equal((await f.invoke('ready')).step.action,'done');
});
test('word-selection actions validate coordinates and strip arbitrary click counts',()=>{
 const selection={...click,action:'double_click'};
 assert.deepEqual(validateStep({...selection,clickCount:500}),selection);
 assert.throws(()=>validateStep({...selection,x:-1}));
});

test('word grounding replaces guessed coordinates and rejects missing or ambiguous text',()=>{
 const {groundWord}=require('../shared/guide-target.cjs');
 const step={...click,action:'double_click',target:'Animals'};
 assert.deepEqual(groundWord(step,[{x:.4,y:.6}]),{...step,x:.4,y:.6});
 assert.throws(()=>groundWord(step,[]),/Could not locate/);
 assert.throws(()=>groundWord(step,[{x:.25,y:.49},{x:.25,y:.51}]),/More than one/);
 assert.throws(()=>groundWord(step,[{x:2,y:.5}]),/Could not locate/);
 assert.deepEqual(groundWord(step,[{x:.25,y:.5},{x:.8,y:.9}]),step);
});

test('a repeated step is verified for completion without sending another action',async t=>{
 const f=fixture(t);await f.invoke('open','Make text red');
 f.model([click,click,{action:'done',instruction:'The text is visibly red.'}]);
 await f.invoke('next','Make text red');await f.invoke('takeover');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.calls.length,1);assert.equal(f.requests.at(-1).verifyOnly,true);
 assert.match((await f.invoke('ready')).takeoverMessage,/complete/);
});
test('verification-only model requests cannot return executable input',async()=>{
 const result=await guideStep({goal:'Make text red',screenshot:'YWJj',verifyOnly:true},{apiKey:'test',fetcher:async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify(click)}]}}]})});
 assert.equal(result.action,'manual');assert.match(result.instruction,/could not verify/);
});

test('native control bounds replace approximate model coordinates before input',async t=>{
 const f=fixture(t);f.controls([{x:620,y:150}]);await f.invoke('open','Open Text color');
 await f.invoke('next','Open Text color');await f.invoke('execute');
 assert.equal(f.calls[0].x,620);assert.equal(f.calls[0].y,150);
});
test('missing OCR word blocks double-click instead of falling back to a guess',async t=>{
 const f=fixture(t);f.words([]);f.model({...click,action:'double_click',target:'Animals'});
 await f.invoke('open','Select Animals');const state=await f.invoke('next','Select Animals');
 assert.match(state.error,/Could not locate/);assert.equal(state.step,null);assert.equal(f.calls.length,0);
});

test('duplicate accessibility nodes at the same position represent one target',()=>{
 const {groundWord}=require('../shared/guide-target.cjs');
 assert.deepEqual(groundWord(click,[{x:.4,y:.3},{x:.4001,y:.3001}]),{...click,x:.4,y:.3});
});
