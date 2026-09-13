import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {shouldCaptureScreen} from '../src/screen-request.js';
const {captureScreen}=createRequire(import.meta.url)('../electron/capture-screen.cjs');
test('spoken and typed direct screen requests attach a fresh screenshot without the checkbox',()=>{
  for(const text of ['Take a screenshot','Jarvis, can you take a screen shot yourself?','Look at my screen','Can you see my screen?','Help me with this page','What is on my screen?','Turn the current screen into study notes','Make slides from this page'])assert.equal(shouldCaptureScreen(text),true,text);
});
test('ordinary chat, screenshot instructions, and explicit refusals do not capture',()=>{
  for(const text of ['I am tired','Make slides about plants','How do I take a screenshot?','Explain how to take a screenshot','What is screen capture?','Do not capture my screen','Stop sharing my screen'])assert.equal(shouldCaptureScreen(text),false,text);
  assert.equal(shouldCaptureScreen("Don't look at my screen",{sharing:true}),false);
  assert.equal(shouldCaptureScreen('Help with this error',{sharing:true}),true);
  assert.equal(shouldCaptureScreen('Help',{once:true}),true);
});
test('screen summaries capture automatically, while unrelated summaries and refusals do not',()=>{
  for(const text of ['Hey can you give me a summary of my screen','Summarize this page','Summarise my screen','Give me an overview of the current screen','Recap the page'])assert.equal(shouldCaptureScreen(text),true,text);
  for(const text of ['Summarize our conversation','Give me a summary of photosynthesis',"Don't summarize my screen"])assert.equal(shouldCaptureScreen(text),false,text);
});
test('capture selects the cursor display, preserves JPEG payload and checks permission first',async()=>{
  const calls=[];
  const result=await captureScreen({permissions:{async ensure(kind){calls.push(kind);}},screen:{getCursorScreenPoint:()=>({x:100,y:10}),getDisplayNearestPoint:()=>({id:2})},desktopCapturer:{async getSources(){calls.push('capture');return [1,2].map(id=>({display_id:String(id),thumbnail:{isEmpty:()=>false,toJPEG:()=>Buffer.from('screen-'+id)}}));}}});
  assert.deepEqual(calls,['screen','capture']);assert.equal(Buffer.from(result,'base64').toString(),'screen-2');
});
test('capture never returns another display when mapping is ambiguous and never bypasses denial',async()=>{
  const screen={getCursorScreenPoint:()=>({}),getDisplayNearestPoint:()=>({id:7})};
  const thumbnail={isEmpty:()=>false,toJPEG:()=>Buffer.from('image')};
  const source={display_id:'',thumbnail};
  const permissions={async ensure(){}};
  assert.equal(await captureScreen({permissions,screen,desktopCapturer:{async getSources(){return [source];}}}),Buffer.from('image').toString('base64'));
  await assert.rejects(captureScreen({permissions,screen,desktopCapturer:{async getSources(){return [source,source];}}}),/under your cursor/);
  await assert.rejects(captureScreen({permissions:{async ensure(){throw new Error('denied');}},desktopCapturer:{async getSources(){assert.fail('must not capture');}}}),/denied/);
});
