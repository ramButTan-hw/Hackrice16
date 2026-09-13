import test from 'node:test';
import assert from 'node:assert/strict';
import * as music from '../shared/music-request.js';
test('first-playlist intent requires an explicit playback request for YouTube Music',()=>{
 for(const text of ['Hey Jarvis open YouTube Music and play my first playlist','play my first playlist on YouTube Music','can you open youtube music and play my 1st playlist please'])assert.equal(music.isFirstPlaylistRequest(text),true,text);
 for(const text of ['open YouTube Music',"don't open YouTube Music and play my first playlist",'play my second playlist on YouTube Music','how do I play my first playlist on YouTube Music'])assert.equal(music.isFirstPlaylistRequest(text),false,text);
 assert.ok(music.FIRST_PLAYLIST_GOAL.length<=1000);
});

test('natural open-up phrasing routes the whole request to playlist playback',()=>{
 for(const text of [
  'Can you open up YouTube Music and play my first playlist?',
  'Hey Jarvis, could you please open up YouTube Music and then play my first playlist?',
  'Please bring up YouTube Music, then start playing my first playlist',
  'Play my first playlist using You Tube Music'
 ])assert.equal(music.isFirstPlaylistRequest(text),true,text);
 for(const text of [
  'Can you explain how to open up YouTube Music and play my first playlist?',
  "Please don't open up YouTube Music and play my first playlist",
  'Open up YouTube Music and play my second playlist',
  'Open up YouTube Music and play my first playlist and delete it'
 ])assert.equal(music.isFirstPlaylistRequest(text),false,text);
});
