import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildSlideDeck,generateSlideImage,presentationUpload} from '../server/slide-deck.js';
import {googleWorkspace,validateGoogleDraft} from '../server/google-workspace.js';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const draft={kind:'create_slides',title:'Study skills',slides:[{title:'One step at a time',bullets:['Choose a clear goal.','Review your progress.'],imagePrompt:'A student with study cards'}]};
test('slide bounds reject overflowing content',()=>{
  assert.throws(()=>validateGoogleDraft({...draft,slides:[]}));assert.throws(()=>validateGoogleDraft({...draft,slides:[{title:'x',bullets:['x'.repeat(181)]}]}));
  assert.equal(validateGoogleDraft({...draft,slides:Array(4).fill(draft.slides[0])}).slides.filter(s=>s.imagePrompt).length,2);
});
test('image quota and empty responses fail clearly; valid output is returned',async()=>{
  await assert.rejects(generateSlideImage('x',{apiKey:'test',fetcher:async()=>new Response('',{status:429})}),/quota/);
  await assert.rejects(generateSlideImage('x',{apiKey:'test',fetcher:async()=>Response.json({candidates:[]})}),/no usable image/);
  const image=await generateSlideImage('x',{apiKey:'test',fetcher:async()=>Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:png}}]}}]})});assert.equal(image,'data:image/png;base64,'+png);
});
test('presentation contains editable text and embedded image; upload converts to Slides',async()=>{
  const bytes=await buildSlideDeck(draft,{0:'data:image/png;base64,'+png});const zip=await JSZip.loadAsync(bytes);
  const slide=await zip.file('ppt/slides/slide1.xml').async('string');assert.match(slide,/Choose a clear goal/);assert.match(slide,/<p:pic>/);
  assert.ok(Object.keys(zip.files).some(f=>f.startsWith('ppt/media/')&&!zip.files[f].dir));
  const upload=presentationUpload(draft.title,'test-id',bytes);assert.match(upload.headers['Content-Type'],/multipart\/related/);assert.ok(upload.body.includes(Buffer.from('application/vnd.google-apps.presentation')));
});
test('illustrations are cached, no writes occur before confirmation, and repeated confirmation is safe',async t=>{
  const path=await mkdtemp(join(tmpdir(),'jarvis-slides-'));t.after(()=>rm(path,{recursive:true,force:true}));let images=0,writes=0;
  const workspace=googleWorkspace({path:join(path,'registry.json'),auth:{status:()=>({connected:true,accountId:'one'}),request:async(url,method,body)=>{assert.match(url,/upload\/drive/);assert.ok(Buffer.isBuffer(body));writes++;return {id:'deck-id'};}},imageGenerator:async()=>{images++;return 'data:image/png;base64,'+png;}});
  const p=await workspace.propose(draft,'conversation');await workspace.illustrate(p.id,'conversation');await workspace.illustrate(p.id,'conversation');assert.equal(images,1);assert.equal(writes,0);
  await assert.rejects(workspace.illustrate(p.id,'wrong'),{status:409});const result=await workspace.execute(p.id,'conversation');await workspace.execute(p.id,'conversation');assert.equal(writes,1);assert.equal(result.status,'done');assert.match(result.result.url,/presentation\/d\/deck-id/);
});

test('preview revisions retain images and saved edits update the same deck after restart',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'jarvis-slide-edit-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'registry.json');let images=0;const writes=[];
  const auth={status:()=>({connected:true,accountId:'one'}),request:async(url,method,body)=>{
    if(url.includes('fields=id,version'))return {id:'deck-id',version:'7'};
    writes.push({url,method,body});return {id:'deck-id'};
  }};
  let workspace=googleWorkspace({path,auth,imageGenerator:async()=>{images++;return 'data:image/png;base64,'+png;}});
  const p=await workspace.propose(draft,'conversation');await workspace.illustrate(p.id,'conversation');
  const revised=await workspace.propose({...draft,title:'Revised study skills',theme:'blue'},'conversation');assert.ok(revised.images[0]);await workspace.execute(revised.id,'conversation');
  workspace=googleWorkspace({path,auth});
  const edit=await workspace.propose({...draft,kind:'update_slides',targetId:'deck-id',title:'Edited deck',theme:'ivory'},'new-conversation');assert.ok(edit.images[0]);
  const saved=await workspace.execute(edit.id,'new-conversation');assert.equal(saved.result.id,'deck-id');assert.equal(writes.length,2);assert.equal(writes[1].method,'PATCH');assert.match(writes[1].url,/files\/deck-id\?/);assert.equal(images,1);
  const body=writes[1].body;const start=body.indexOf(Buffer.from('PK\x03\x04'));const end=body.lastIndexOf(Buffer.from('\r\n--jarvis_'));const zip=await JSZip.loadAsync(body.subarray(start,end));const xml=await zip.file('ppt/slides/slide1.xml').async('string');assert.match(xml,/<p:pic>/);assert.match(xml,/F5F1E8/);
});

test('standalone images attach to selected slides and invalid targets are rejected',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'jarvis-slide-attach-'));t.after(()=>rm(dir,{recursive:true,force:true}));const workspace=googleWorkspace({path:join(dir,'registry.json'),auth:{status:()=>({connected:false})}});
  const p=await workspace.propose(draft,'c');assert.throws(()=>workspace.attachImage(p.id,'other',0,'data:image/png;base64,'+png,'Room'));
  const result=workspace.attachImage(p.id,'c',0,'data:image/png;base64,'+png,'Room');assert.ok(result.images[0]);assert.equal(result.slides[0].imagePrompt,'Room');
  assert.throws(()=>workspace.attachImage(p.id,'c',9,'data:image/png;base64,'+png,'Room'));
});
