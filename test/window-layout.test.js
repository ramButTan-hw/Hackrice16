import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {snapBounds}=createRequire(import.meta.url)('../electron/window-layout.cjs');
test('edge snap aligns nearby edges and corners without resizing or attracting distant windows',()=>{
  const area={x:0,y:0,width:1920,height:1040};
  assert.deepEqual(snapBounds({x:15,y:14,width:468,height:490},area),{x:8,y:8,width:468,height:490});
  assert.deepEqual(snapBounds({x:1430,y:530,width:468,height:490},area),{x:1444,y:542,width:468,height:490});
  const middle={x:500,y:200,width:600,height:700};assert.deepEqual(snapBounds(middle,area),middle);
});
test('edge snap uses the work area of the chosen monitor, including negative coordinates and taskbar space',()=>{
  const area={x:-1600,y:40,width:1600,height:860};
  assert.deepEqual(snapBounds({x:-1599,y:30,width:440,height:440},area),{x:-1592,y:48,width:440,height:440});
  assert.equal(snapBounds({x:-450,y:448,width:440,height:440},area).y,452);
});
