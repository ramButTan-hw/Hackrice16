import test from 'node:test';
import assert from 'node:assert/strict';
import {speechBoundary} from '../src/speech-boundary.js';
test('finalizes successive spoken replies after silence but not noise or short pauses',()=>{
  const boundary=speechBoundary(),quiet=new Int16Array(512),voice=new Int16Array(512).fill(1000);
  for(let i=0;i<40;i++)assert.equal(boundary(quiet),false);
  for(let turn=0;turn<2;turn++){
    for(let i=0;i<10;i++)assert.equal(boundary(voice),false);
    for(let i=0;i<31;i++)assert.equal(boundary(quiet),false);
    assert.equal(boundary(quiet),true);assert.equal(boundary(quiet),false);
  }
});
