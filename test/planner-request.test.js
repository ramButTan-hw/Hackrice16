import test from 'node:test';
import assert from 'node:assert/strict';
import {isPlannerRequest,openPlanner} from '../src/planner-request.js';
import {generateReply} from '../server/chat.js';

test('explicit spoken and typed planner requests are recognized without matching advice or negations',()=>{
  for(const text of ['open my planner','Jarvis, open my planner.','Hey Jarvis, can you open the planner?','Could you bring up my schedule please?','show me the planner','launch planner window'])assert.equal(isPlannerRequest(text),true,text);
  for(const text of ["don't open my planner",'do not open the planner','Can you help me plan tomorrow?','How do I open my planner?','Open Google Calendar','Explain what open my planner means','open my planner instead of this document'])assert.equal(isPlannerRequest(text),false,text);
});
test('planner opens from both main chat and voice panel; failures propagate',async()=>{
  let main=0,panel=0;
  await openPlanner({companionWindow:{planner:async()=>{main++;}}});
  await openPlanner({helpPanel:{planner:async()=>{panel++;}}});
  assert.equal(main,1);assert.equal(panel,1);
  await assert.rejects(openPlanner({helpPanel:{}}),/Restart Jarvis/);
  await assert.rejects(openPlanner({companionWindow:{planner:async()=>{throw new Error('window failed');}}}),/window failed/);
  await assert.rejects(openPlanner({open:()=>null}),/blocked/);
});
test('Gemini planner tool returns a UI action without changing session or feeling',async()=>{
  let request;
  const response=await generateReply({sessionId:'session',messages:[{role:'user',text:'Let me see my planning window'}],memory:false},{
    apiKey:'test',sessions:{get:async()=>({goal:'Read',status:'active'}),state:async()=>({}),update:()=>assert.fail('Must not change the session')},onText:()=>{},
    fetcher:async(_url,options)=>{request=JSON.parse(options.body);return new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{functionCall:{name:'open_planner',args:{}}}]}}]})+'\n\n');},
  });
  assert.ok(request.tools[0].functionDeclarations.some(t=>t.name==='open_planner'));
  assert.equal(response.uiAction,'open_planner');assert.equal(response.action,undefined);assert.match(response.text,/planner/);
});
