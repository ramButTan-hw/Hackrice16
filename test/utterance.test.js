import test from 'node:test';
import assert from 'node:assert/strict';
import {utterance} from '../src/utterance.js';
const quiet=()=>new Int16Array(512),voice=()=>new Int16Array(512).fill(1200);
test('silence times out locally without uploading; speech ends after a deliberate pause',async()=>{
  const silent=utterance();let result;
  for(let n=0;n<375;n++)result=silent(quiet());assert.equal(result.audio,null);
  for(let turn=0;turn<2;turn++){
    const capture=utterance();for(let n=0;n<20;n++)assert.equal(capture(voice()),null);
    for(let n=0;n<43;n++)assert.equal(capture(quiet()),null);
    const result=capture(quiet());assert.equal(result.audio.type,'audio/wav');
    const view=new DataView(await result.audio.arrayBuffer());assert.equal(view.getUint32(24,true),16000);assert.equal(view.getUint32(40,true),view.byteLength-44);
    assert.equal(capture(voice()),null);
  }
});
test('a brief click does not submit a voice request',()=>{
  const capture=utterance({maxMs:2000});capture(voice());let result;
  for(let n=0;n<62;n++)result=capture(quiet());assert.equal(result.audio,null);
});
