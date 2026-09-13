import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createCheckinNotifier}=createRequire(import.meta.url)('../electron/checkin-notification.cjs');
test('each check-in gets one sound, taskbar cue and toast, even when repeatedly polled',()=>{
  let beeps=0,flashes=0,reveals=0;const notices=[];
  class Notification{static isSupported(){return true;}constructor(options){this.options=options;this.events={};notices.push(this);}on(event,fn){this.events[event]=fn;}show(){this.shown=true;}close(){this.closed=true;}}
  const notifier=createCheckinNotifier({Notification,beep:()=>beeps++,flash:()=>flashes++,reveal:()=>reveals++});
  const checkin={id:'attention-1',text:'Hey, how are we doing?'};
  assert.equal(notifier.notify(checkin),true);assert.equal(notifier.notify(checkin),false);
  assert.equal(beeps,1);assert.equal(flashes,1);assert.equal(notices.length,1);assert.equal(notices[0].options.body,checkin.text);assert.equal(notices[0].options.silent,true);
  notices[0].events.click();assert.equal(reveals,1);
  notifier.reset();assert.equal(notices[0].closed,true);notices[0].events.click();assert.equal(reveals,1);
  notifier.notify({id:'attention-2',text:'Next check-in'});assert.equal(beeps,2);
});
test('unsupported or failing desktop toasts cannot suppress the local attention alert',()=>{
  for(const supported of [false,true]){
    let beeps=0,flashes=0;
    class Notification{static isSupported(){return supported;}constructor(){throw new Error('OS denied');}}
    const notifier=createCheckinNotifier({Notification,beep:()=>beeps++,flash:()=>flashes++});
    assert.equal(notifier.notify({id:'test',text:'Still focused?'}),true);
    assert.equal(beeps,1);assert.equal(flashes,1);
  }
});
