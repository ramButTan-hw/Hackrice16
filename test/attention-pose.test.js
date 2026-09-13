import test from 'node:test';
import assert from 'node:assert/strict';
import {headAngles,classifyAttentionPose,angleDistance} from '../shared/attention-pose.js';
const rotation=degrees=>{const r=degrees*Math.PI/180,c=Math.cos(r),s=Math.sin(r);return [1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];};
const base={x:0,y:.35,pitch:0,yaw:0};
test('3D forward tilt is detected even when the 2D nose position barely changes and phone is hidden',()=>{
  const pose={...base,...headAngles(rotation(25))};assert.ok(Math.abs(pose.pitch-25)<.001);
  assert.equal(classifyAttentionPose(pose,base,false).state,'away');
  assert.equal(classifyAttentionPose({...base,...headAngles(rotation(-25))},base,false).state,'away');
});
test('phone supports smaller tilt but a phone alone never triggers',()=>{
  assert.equal(classifyAttentionPose({...base,pitch:14},base,false).state,'screen');
  assert.equal(classifyAttentionPose({...base,pitch:14},base,true).state,'phone');
  assert.equal(classifyAttentionPose(base,base,true).state,'screen');
});
test('personal baseline, sideways turns, malformed transforms and angle wrap are handled',()=>{
  assert.equal(classifyAttentionPose({...base,pitch:30},{...base,pitch:24},false).state,'screen');
  assert.equal(classifyAttentionPose({...base,x:.3},base,false).state,'away');
  assert.equal(headAngles(Array(16).fill(0)),null);assert.equal(headAngles([1]),null);
  assert.equal(angleDistance(-179,179),2);
});
