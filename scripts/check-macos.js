// Validate the source-development Electron bundle before launching it on a Mac.
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
if(process.platform==='darwin'){
  const require=createRequire(import.meta.url);
  if(process.arch!=='arm64')throw new Error('Full Presage monitoring needs Apple Silicon and ARM64 Node. Disable Rosetta for your terminal and reinstall node_modules with native Node. Intel Macs are not supported by the Presage runtime.');
  const executable=require('electron');
  const contents=resolve(dirname(executable),'..');
  const plist=join(contents,'Info.plist');
  if(!existsSync(plist))throw new Error('Electron.app is incomplete. Run npm ci again on this Mac.');
  const binary=execFileSync('/usr/bin/file',[executable],{encoding:'utf8'});
  if(!binary.includes('arm64'))throw new Error('Electron is not ARM64. Remove an npm_config_arch=x64 override and run npm ci again.');
  const usage={NSCameraUsageDescription:'Jarvis uses your camera for biometric and local attention monitoring during a session.',NSMicrophoneUsageDescription:'Jarvis uses your microphone for the wake phrase and spoken requests.'};
  let changed=false;
  for(const [key,message] of Object.entries(usage)){
    let current='';
    try{current=execFileSync('/usr/libexec/PlistBuddy',['-c',`Print :${key}`,plist],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
    if(!current){
      // Only fill missing development usage descriptions; never change a packaged app.
      try{execFileSync('/usr/libexec/PlistBuddy',['-c',`Add :${key} string ${message}`,plist],{stdio:'ignore'});}
      catch{execFileSync('/usr/libexec/PlistBuddy',['-c',`Set :${key} ${message}`,plist],{stdio:'inherit'});}
      changed=true;
    }
  }
  if(changed)execFileSync('/usr/bin/codesign',['--force','--deep','--preserve-metadata=entitlements','--sign','-',resolve(contents,'..')],{stdio:'inherit'});
  require('@smartspectra/node-sdk'); // Load the native closure, without opening a camera.
  console.log('macOS ARM64 and Electron media usage descriptions checked.');
}
