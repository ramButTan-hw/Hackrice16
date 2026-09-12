import test from 'node:test';
import assert from 'node:assert/strict';
import {generateImage} from '../server/image-generation.js';
import {generateReply} from '../server/chat.js';
test('standalone images preserve requested style and validate inputs before spending quota',async()=>{
  await assert.rejects(generateImage('',{apiKey:'test'}),{status:400});
  await assert.rejects(generateImage('room',{apiKey:'test',aspectRatio:'bad'}),{status:400});
  await assert.rejects(generateImage('A blue watercolor room',{apiKey:'image-only-key',aspectRatio:'3:4',fetcher:async(_url,options)=>{
    const body=JSON.parse(options.body);assert.equal(options.headers['x-goog-api-key'],'image-only-key');assert.equal(body.generationConfig.imageConfig.aspectRatio,'3:4');assert.match(body.contents[0].parts[0].text,/blue watercolor room/);assert.doesNotMatch(body.contents[0].parts[0].text,/forest green/);return Response.json({});
  }}),/no usable image/);
});
test('chat returns an image request without falsely reporting completed generation',async()=>{
  const result=await generateReply({messages:[{role:'user',text:'Generate an image of a blue room'}],memory:false},{apiKey:'test',onText:()=>{},fetcher:async()=>new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{functionCall:{name:'generate_image',args:{prompt:'A blue room',aspectRatio:'16:9'}}}]}}]})+'\n\n')});
  assert.deepEqual(result.imageRequest,{prompt:'A blue room',aspectRatio:'16:9'});assert.equal(result.text,'Generating your image…');assert.equal(result.image,undefined);
});
