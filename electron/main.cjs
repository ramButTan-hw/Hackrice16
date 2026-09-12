const { app, BrowserWindow, ipcMain, screen, powerMonitor, desktopCapturer, globalShortcut } = require('electron');
const path = require('node:path');
const { existsSync } = require('node:fs');
if (existsSync('.env')) process.loadEnvFile('.env');
const presage = require('./presage.cjs').createPresage({ idle: () => powerMonitor.getSystemIdleTime() });
const help = require('./help-runtime.cjs').createHelpRuntime();
let helpSession=null;
const development = process.argv.includes('--dev');
let server;
let backend;
let appUrl;

function createWindow() {
  const window = new BrowserWindow({
    width: 468,
    height: 490,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: 'Session',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== new URL(appUrl).origin) event.preventDefault();
  });
  window.loadURL(appUrl);
  globalShortcut.register('CommandOrControl+Shift+Space',()=>{if(helpSession&&!window.isDestroyed()){window.show();window.webContents.send('help:event',{wake:true});}});
  window.on('closed',()=>{appearanceWindow?.destroy();closeHelpPanel();help.stop();helpSession=null;globalShortcut.unregisterAll();});
  window.webContents.on('did-start-loading',()=>{help.stop();helpSession=null;});
  window.on('closed', () => { void presage.stop().catch(console.error); });
  window.webContents.on('render-process-gone', () => { help.stop();helpSession=null;void presage.stop().catch(console.error); });
  window.webContents.on('did-start-loading', () => { void presage.stop().catch(console.error); });
}

let helpPanel=null, helpOwner=null, panelState=null;
function closeHelpPanel(){const panel=helpPanel;helpPanel=null;panelState=null;panel?.destroy();}
ipcMain.handle('help:panel',(event,state)=>{
  trustedWindow(event);
  if(state===null){closeHelpPanel();return;}
  if(!state||typeof state.transcript!=='string'||state.transcript.length>5000||JSON.stringify(state).length>12000)throw new Error('Invalid help panel state.');
  panelState=state;helpOwner=event.sender;
  if(!helpPanel){
    const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const width=Math.min(440,area.width-24),height=Math.min(440,area.height-24);
    helpPanel=new BrowserWindow({width,height,x:area.x+area.width-width-18,y:area.y+24,show:false,frame:false,transparent:true,resizable:false,alwaysOnTop:true,skipTaskbar:true,title:'Companion voice',autoHideMenuBar:true,backgroundColor:'#00000000',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,preload:path.join(__dirname,'help-panel-preload.cjs')}});
    helpPanel.once('ready-to-show',()=>helpPanel?.showInactive());
    helpPanel.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    helpPanel.webContents.on('will-navigate',e=>e.preventDefault());
    const panel=helpPanel;
    helpPanel.on('closed',()=>{if(helpPanel!==panel)return;helpPanel=null;panelState=null;if(helpOwner&&!helpOwner.isDestroyed())helpOwner.send('help:event',{panelAction:'close'});});
    helpPanel.loadURL(appUrl+'/?help-window=1');
  }else helpPanel.webContents.send('help:panel-state',state);
});
ipcMain.handle('help:panel-ready',event=>{if(event.sender!==helpPanel?.webContents)throw new Error('Untrusted panel');return panelState;});
ipcMain.on('help:panel-action',(event,action)=>{
  if(event.sender!==helpPanel?.webContents||!['close','fine','stuck','tired','helpful','not_helpful','break_start','listening','idle'].includes(action))return;
  if(helpOwner&&!helpOwner.isDestroyed())helpOwner.send('help:event',{panelAction:action});
});

// Expose only window controls to the trusted top-level renderer.
function trustedWindow(event) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || event.senderFrame !== event.sender.mainFrame
    || new URL(event.senderFrame.url).origin !== new URL(appUrl).origin) throw new Error('Untrusted window');
  return window;
}
let appearanceWindow=null;
ipcMain.handle('window:appearance',event=>{
  const owner=trustedWindow(event);
  if(appearanceWindow){appearanceWindow.show();appearanceWindow.focus();return;}
  appearanceWindow=new BrowserWindow({width:380,height:360,title:'Appearance',parent:owner,autoHideMenuBar:true,backgroundColor:'#26332e',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  appearanceWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  appearanceWindow.webContents.on('will-navigate',event=>event.preventDefault());
  appearanceWindow.on('closed',()=>{appearanceWindow=null;});
  appearanceWindow.loadURL(appUrl+'/?appearance-window=1');
});
ipcMain.handle('window:compact', (event, compact) => {
  if (typeof compact !== 'boolean') throw new Error('Invalid window mode');
  const window = trustedWindow(event);
  const bounds = window.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(compact ? 368 : 468, area.width);
  const height = Math.min(compact ? 90 : 490, area.height);
  window.setBounds({ x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)), width, height });
  return compact;
});
ipcMain.handle('window:pinned', (event, pinned) => {
  if (typeof pinned !== 'boolean') throw new Error('Invalid pin state');
  trustedWindow(event).setAlwaysOnTop(pinned);
  return pinned;
});
ipcMain.on('window:minimize', event => trustedWindow(event).minimize());
ipcMain.on('window:close', event => trustedWindow(event).close());
ipcMain.handle('presage:status', event => { trustedWindow(event); return presage.status(); });
ipcMain.handle('presage:start', event => { trustedWindow(event); return presage.start(event.sender); });
ipcMain.handle('presage:stop', event => { trustedWindow(event); return presage.stop(); });
ipcMain.handle('presage:frame', (event, frame) => { trustedWindow(event); return presage.frame(event.sender, frame); });
ipcMain.handle('presage:idle', event => { trustedWindow(event); return powerMonitor.getSystemIdleTime(); });
ipcMain.handle('help:session',(event,id)=>{trustedWindow(event);if(id!==null&&(typeof id!=='string'||!/^[\w-]{1,80}$/.test(id)))throw new Error('Invalid session.');if(helpSession!==id){closeHelpPanel();help.stop();}helpSession=id;return help.status();});
function activeHelp(event){const window=trustedWindow(event);if(!helpSession)throw new Error('Start a session manually first.');return window;}
ipcMain.handle('help:status',event=>{
  trustedWindow(event);const status=help.status();
  // Counts and times only: never persist audio, transcripts, images, or keys.
  const fs=require('node:fs');const folder=path.join(__dirname,'../data');
  try{fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'voice-status.json'),JSON.stringify({timestamp:Date.now(),sessionId:helpSession,...status}));}catch{}
  return status;
});
ipcMain.handle('help:wake-start',event=>{activeHelp(event);return help.startWake();});
ipcMain.handle('help:wake-stop',event=>{trustedWindow(event);help.stopWake();});
ipcMain.handle('help:wake-audio',(event,data)=>{activeHelp(event);return help.wakeAudio(data);});
ipcMain.handle('help:live-start',(event,context)=>{activeHelp(event);help.stopWake();help.startLive(value=>{if(!event.sender.isDestroyed())event.sender.send('help:event',value);},context);});
ipcMain.handle('help:live-stop',event=>{trustedWindow(event);help.stopLive();});
ipcMain.handle('help:send',(event,kind,data)=>{activeHelp(event);return help.send(kind,data);});
ipcMain.handle('help:screen',async event=>{
  activeHelp(event);const display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:1280,height:1280}});
  const source=sources.find(s=>s.display_id===String(display.id));if(!source||source.thumbnail.isEmpty())throw new Error('Could not capture this display.');
  return help.send('video',source.thumbnail.toJPEG(70).toString('base64'));
});
ipcMain.handle('help:snapshot',async event=>{
  if(event.sender!==helpPanel?.webContents)activeHelp(event);
  const display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:1280,height:1280}});
  const source=sources.find(s=>s.display_id===String(display.id));
  if(!source||source.thumbnail.isEmpty())throw new Error('Could not capture this display.');
  return source.thumbnail.toJPEG(70).toString('base64');
});
ipcMain.handle('help:reveal',event=>{const window=activeHelp(event);window.show();window.flashFrame(true);});

app.whenReady().then(async () => {
  if (development) {
    appUrl = 'http://127.0.0.1:5173';
  } else {
    const { createApp } = await import('../server/app.js');
    await new Promise((resolve, reject) => {
      backend = createApp();
      server = backend.listen(0, '127.0.0.1', resolve);
      server.on('error', reject);
    });
    appUrl = 'http://127.0.0.1:' + server.address().port;
  }
  createWindow();
  powerMonitor.on('suspend', () => { help.stop();void presage.stop().catch(console.error); });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
let quitting = false;
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); quitting = true;
  help.stop();globalShortcut.unregisterAll();
  presage.stop().catch(console.error).finally(async () => { await backend?.locals.close(); server?.close(); app.quit(); });
});
