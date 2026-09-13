import test from 'node:test';
import assert from 'node:assert/strict';
import {widgetRequest} from '../src/widget-request.js';
import {websiteRequest} from '../shared/website-request.js';
import {appRequest} from '../shared/app-request.js';
import {guideRequest} from '../src/guide-request.js';
import {isPlannerRequest} from '../shared/planner-intent.js';
import {isFirstPlaylistRequest} from '../shared/music-request.js';
import {googleOpenRequest} from '../src/google-open-request.js';

test('Acumen commands and the legacy Jarvis wake prefix select the same actions',()=>{
 for(const name of ['Acumen','Jarvis']){
  assert.deepEqual(widgetRequest(`${name}, start a 5 minute timer`),widgetRequest('start a 5 minute timer'));
  assert.deepEqual(websiteRequest(`hey ${name}, open Google`),websiteRequest('open Google'));
  assert.deepEqual(appRequest(`${name}, open Calculator`),appRequest('open Calculator'));
  assert.deepEqual(guideRequest(`${name}, guide me through my assignment`),{goal:'my assignment'});
  assert.equal(isPlannerRequest(`${name}, open my planner`),true);
  assert.equal(isFirstPlaylistRequest(`${name}, open youtube music and play my first playlist`),true);
  assert.equal(googleOpenRequest(`${name}, open in Google`),true);
 }
});
