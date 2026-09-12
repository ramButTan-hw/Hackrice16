import test from 'node:test';
import assert from 'node:assert/strict';
import {handleFeeling} from '../src/live-tools.js';
test('feeling receipt reaches Gemini before a slow database finishes',async()=>{
  const order=[];let finish;
  const saving=new Promise(resolve=>{finish=resolve;});
  const result=handleFeeling({id:'call-1',name:'report_feeling',args:{feeling:'stuck'}},{send:async(kind,data)=>{order.push('ack');assert.equal(data.pending,true);return true;},save:async()=>{order.push('save');return saving;},onSaved:()=>order.push('saved'),onError:assert.fail});
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(order,['ack','save']);finish({});await result;assert.deepEqual(order,['ack','save','saved']);
});
test('save failures do not block acknowledgement or pretend the answer was saved',async()=>{
  let ack=false,error;
  await handleFeeling({id:'call-2',name:'report_feeling',args:{feeling:'tired'}},{send:async()=>{ack=true;return true;},save:async()=>{throw new Error('database');},onSaved:assert.fail,onError:e=>{error=e;}});
  assert.equal(ack,true);assert.match(error.message,/could not be saved/);
});
