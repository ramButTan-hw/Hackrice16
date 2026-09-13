import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {memoryService} from '../server/memory.js';
import {transcribe} from '../server/transcription.js';
import {generateReply} from '../server/chat.js';

test('Scribe receives a bounded multipart recording and reports quota failures safely',async()=>{
  const audio=Buffer.alloc(200);
  const result=await transcribe(audio,'audio/webm;codecs=opus',{apiKey:'test',fetcher:async(url,options)=>{
    assert.equal(url,'https://api.elevenlabs.io/v1/speech-to-text');assert.equal(options.headers['xi-api-key'],'test');
    assert.equal(options.body.get('model_id'),'scribe_v2');assert.equal(options.body.get('file').size,200);
    return Response.json({text:'Give me a hint.'});
  }});assert.equal(result.text,'Give me a hint.');
  await assert.rejects(transcribe(audio,'audio/webm',{apiKey:'test',fetcher:async()=>new Response('secret provider detail',{status:429})}),e=>e.status===429&&!e.message.includes('secret'));
  await assert.rejects(transcribe(audio,'text/plain',{apiKey:'test'}),{status:400});
});

test('Backboard identities persist across sessions and isolate demo memories',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'companion-memory-'));const path=join(dir,'ids.json');let created=0;const writes=[];
  const fetcher=async(url,options)=>{
    if(url.endsWith('/assistants'))return Response.json({assistant_id:'assistant-'+(++created)});
    writes.push({url,body:options.body&&JSON.parse(options.body)});
    return Response.json({memories:[{id:'m1',content:'Hints first'}],memory_id:'m1'});
  };
  try{
    const first=memoryService({apiKey:'test',fetcher,path});await first.save('Hints first','presage');await first.save('Synthetic preference','demo');
    const second=memoryService({apiKey:'test',fetcher,path});await second.search('Hints','presage');
    assert.equal(created,2);assert.match(writes[0].url,/assistant-1/);assert.match(writes[1].url,/assistant-2/);assert.match(writes[2].url,/assistant-1/);
    assert.equal(writes[0].body.metadata.source,'real');assert.equal(writes[1].body.metadata.source,'demo');
  }finally{await rm(dir,{recursive:true,force:true});}
});

function sse(parts){const str=parts.map(part=>'data: '+JSON.stringify({candidates:[{content:{parts:[part]}}]})+'\n\n').join('');const bytes=new TextEncoder().encode(str);return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}}));}
test('stream survives split SSE frames, includes screenshot and check-in, and memory failure preserves reply',async()=>{
  let request;const chunks=[];
  const reply=await generateReply({sessionId:'s1',messages:[{role:'user',text:'Help me'}],screenshot:'YWJj'},{
    apiKey:'test',sessions:{get:async()=>({goal:'Study',source:'demo',assistance:{checkin:{text:'How is it going?'}}}),state:async()=>({})},
    memory:{configured:true,search:async()=>{throw new Error('offline');},save:async()=>{throw new Error('offline');}},onText:text=>chunks.push(text),
    fetcher:async(_url,options)=>{request=JSON.parse(options.body);return sse([{text:'One '},{text:'small step.'}]);}
  });
  assert.equal(chunks.join(''),'One small step.');assert.equal(reply.text,'One small step.');assert.equal(reply.memoryStatus,'save unavailable');
  assert.equal(request.contents[0].parts[1].inlineData.data,'YWJj');assert.match(request.systemInstruction.parts[0].text,/How is it going/);
});
test('natural feeling tool updates the break score and always produces visible text',async()=>{
  const session={status:'active',goal:'Study',source:'demo',startedAt:Date.now()};let updates=0;
  const reply=await generateReply({sessionId:'s1',memory:false,messages:[{role:'user',text:'I feel worn out'}]},{apiKey:'test',sessions:{get:async()=>session,state:async()=>({}),update:async(_id,fn)=>{updates++;fn(session);}},onText:()=>{},fetcher:async()=>sse([{functionCall:{name:'report_feeling',args:{feeling:'tired'}}}])});
  assert.equal(updates,1);assert.equal(session.assistance.feeling,'tired');assert.equal(session.assistance.score,3);assert.match(reply.text,/break/);
});
test('memory opt-out prevents all provider memory reads and writes',async()=>{
  const reply=await generateReply({memory:false,messages:[{role:'user',text:'Hi'}]},{apiKey:'test',memory:{configured:true,search:()=>assert.fail('read'),save:()=>assert.fail('write')},fetcher:async()=>Response.json({candidates:[{content:{parts:[{text:'Hello'}]}}]})});
  assert.equal(reply.memoryStatus,'off');
});
test('temporary overload tries the alternate model once and keeps streaming',async()=>{
  const urls=[];const chunks=[];
  const reply=await generateReply({memory:false,messages:[{role:'user',text:'Help with this page'}]},{apiKey:'test',model:'gemini-3-flash-preview',onText:t=>chunks.push(t),fetcher:async url=>{urls.push(url);return urls.length===1?new Response('overloaded',{status:503}):sse([{text:'Share the screenshot so I can help.'}]);}});
  assert.equal(urls.length,2);assert.notEqual(urls[0],urls[1]);assert.equal(chunks.join(''),reply.text);
});
test('persistent overload is reported accurately and never loops',async()=>{
  let calls=0;
  await assert.rejects(generateReply({memory:false,messages:[{role:'user',text:'Hello'}]},{apiKey:'test',fetcher:async()=>{calls++;return new Response('overloaded',{status:503});}}),e=>e.status===503&&e.message.includes('overloaded')&&!e.message.includes('key'));
  assert.equal(calls,2);
});
