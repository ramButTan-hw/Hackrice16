// Desktop smoke test with synthetic microphone input. No real microphone or screen capture.
const {app,BrowserWindow,ipcMain}=require('electron');
const {readFileSync,writeFileSync}=require('node:fs');
const path=require('node:path');
const pcm=Buffer.concat([readFileSync('data/live-probe.pcm'),Buffer.alloc(64000)]),wav=Buffer.alloc(44);
wav.write('RIFF');wav.writeUInt32LE(pcm.length+36,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);writeFileSync('data/ui-probe.wav',Buffer.concat([wav,pcm]));
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-file-for-fake-audio-capture',path.resolve('data/ui-probe.wav'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
ipcMain.handle('help:panel-ready',()=>({transcript:'How is your work going?',listenId:1}));
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:440,height:440,webPreferences:{preload:path.resolve('electron/help-panel-preload.cjs'),contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  try{
    await win.loadURL('http://127.0.0.1:3001/?help-window=1');await delay(500);
    // Turn off memory so this transport test cannot populate real work memories.
    await win.webContents.executeJavaScript("[...document.querySelectorAll('label')].find(e=>e.textContent.includes('Remember work context')).querySelector('input').click()");
    for(let turn=1;turn<=2;turn++){
      let done=false;
      for(let n=0;n<100;n++){
        await delay(400);
        const status=await win.webContents.executeJavaScript("({phase:document.querySelector('.ai-status').textContent,error:document.querySelector('.voice-error')?.textContent,count:document.querySelectorAll('.ai-message.user').length*2})");
        if(status.error)throw new Error(status.error);
        if((status.phase.includes('Ready when you are')||status.phase.includes('Listening'))&&status.count===turn*2){console.log(JSON.stringify({turn,messages:status.count,automaticTurnComplete:true}));done=true;break;}
      }
      if(!done)throw new Error('UI reply timed out');
    }
    await delay(300);
    writeFileSync('data/text-ui.png',(await win.webContents.capturePage()).toPNG());
  }catch(e){console.error(e.message);process.exitCode=1;}
  finally{win.destroy();app.exit(process.exitCode||0);}
});
