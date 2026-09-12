import test from 'node:test';
import assert from 'node:assert/strict';
import {isDismissal} from '../src/dismiss-intent.js';
test('spoken dismissal accepts clear requests and avoids task-progress false positives',()=>{
  for(const text of ["I'm done.",'Not now, thanks.',"I don't need help",'No thank you','Close the window please',"That's all",'Stop talking'])assert.equal(isDismissal(text),true,text);
  for(const text of ["I'm not done", "I'm done with the first step", "Don't close the window", 'How do I close the window in Python?', 'I need help', "I'm done but I need help with something else"])assert.equal(isDismissal(text),false,text);
});
