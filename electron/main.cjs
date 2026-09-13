const { app, BrowserWindow, ipcMain, screen, powerMonitor, desktopCapturer, globalShortcut, shell, dialog, systemPreferences, session, Notification } = require('electron');
// Keep existing sessions, preferences, and OAuth state across the display-name change.
const existingUserData=app.getPath('userData');
app.setName('Acumen');
app.setPath('userData',existingUserData);
const {finishSessionAndStop}=require('./end-session.cjs');
const path = require('node:path');
const {openGoogleLink}=require('./google-links.cjs');
const {attachEdgeSnap}=require('./window-layout.cjs');
const expandedSizes=new WeakMap();
const launchApp=require('./app-launcher.cjs').createAppLauncher({home:app.getPath('home')});
async function launchTarget(step){
 if(step.action==='open_app')return launchApp(step.name);
 const {websiteUrl}=await import('../shared/website-request.js');const url=websiteUrl(step.url);await shell.openExternal(url,{activate:true});return {name:new URL(url).hostname};
}
const { existsSync } = require('node:fs');
// Source launches must not depend on the terminal/Finder working directory.
if (!app.isPackaged) process.chdir(path.join(__dirname, '..'));
const rehearsal = process.argv.includes('--rehearsal') && process.env.JARVIS_REHEARSAL === '1';
if (!rehearsal && existsSync('.env')) process.loadEnvFile('.env');
const presage = require('./presage.cjs').createPresage({ idle: () => powerMonitor.getSystemIdleTime() });
const help = require('./help-runtime.cjs').createHelpRuntime();
const {createPermissions,installMediaPermissions}=require('./permissions.cjs');
const permissions=createPermissions({systemPreferences,shell,desktopCapturer});
let helpSession=null;
const development = process.argv.includes('--dev');
let server;
let backend;
let guide;
let appUrl;
function surfaceUrl(query = '') {
  const url = new URL('/' + query, appUrl);
  if (rehearsal) url.searchParams.set('rehearsal', '1');
  return url.href;
}
let mainWindow=null,lastSession=null,closing=null,shutdownComplete=false;
if(process.platform==='win32')app.setAppUserModelId(app.isPackaged?'com.jarvis.companion':process.execPath);
const notifier=require('./checkin-notification.cjs').createCheckinNotifier({Notification,beep:()=>shell.beep(),flash:()=>mainWindow?.flashFrame(true),reveal:()=>{if(helpPanel&&!helpPanel.isDestroyed())helpPanel.show();else mainWindow?.show();},report:message=>console.warn(message)});

function closeApplication(){
  if(closing)return closing;
  const id=lastSession;
  mainWindow?.setEnabled(false);
  guide?.stop();closeHelpPanel();help.stop();
  closing=(async()=>{
    await finishSessionAndStop(development?'http://127.0.0.1:3001':appUrl,id,{stop:()=>presage.stop()});
    await backend?.locals.close();
    server?.close();
    shutdownComplete=true;
    globalShortcut.unregisterAll();
    app.quit();
  })().catch(error=>{
    console.error('App close:',error.message);
    if(mainWindow&&!mainWindow.isDestroyed()){mainWindow.setEnabled(true);mainWindow.show();}
    dialog.showErrorBox('Session could not be ended','The app has stayed open so the session is not left running after exit. Check the backend connection, then close again.');
  }).finally(()=>{closing=null;});
  return closing;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 468,
    height: rehearsal ? Math.min(720, screen.getPrimaryDisplay().workArea.height) : 490,
    frame: false,
    transparent: true,
    // The rounded renderer surface owns the border; native shadows outline the clear window bounds.
    hasShadow: false,
    backgroundColor: '#00000000',
    resizable: true,
    minWidth: 380,
    minHeight: 360,
    alwaysOnTop: true,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: rehearsal ? 'Acumen rehearsal' : 'Acumen',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  mainWindow=window;
  attachEdgeSnap(window,screen);
  window.on('close',event=>{if(!shutdownComplete){event.preventDefault();void closeApplication();}});
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== new URL(appUrl).origin) event.preventDefault();
  });
  window.loadURL(surfaceUrl());
  globalShortcut.register('CommandOrControl+Shift+Space',()=>{if(helpSession&&!window.isDestroyed()){window.show();window.webContents.send('help:event',{wake:true});}});
  window.on('closed',()=>{for(const panel of widgetWindows.values())panel.destroy();plannerWindow?.destroy();appearanceWindow?.destroy();closeHelpPanel();help.stop();helpSession=null;globalShortcut.unregisterAll();});
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
    helpPanel=new BrowserWindow({width,height,x:area.x+area.width-width-18,y:area.y+24,show:false,frame:false,transparent:true,hasShadow:false,resizable:true,minWidth:360,minHeight:320,maximizable:false,fullscreenable:false,alwaysOnTop:mainWindow?.isAlwaysOnTop()??true,skipTaskbar:true,title:'Companion voice',autoHideMenuBar:true,backgroundColor:'#00000000',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,preload:path.join(__dirname,'help-panel-preload.cjs')}});
    attachEdgeSnap(helpPanel,screen);
    helpPanel.once('ready-to-show',()=>helpPanel?.showInactive());
    helpPanel.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    helpPanel.webContents.on('will-navigate',e=>e.preventDefault());
    const panel=helpPanel;
    helpPanel.on('closed',()=>{if(helpPanel!==panel)return;helpPanel=null;panelState=null;if(helpOwner&&!helpOwner.isDestroyed())helpOwner.send('help:event',{panelAction:'close'});});
    helpPanel.loadURL(surfaceUrl('?help-window=1'));
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
const widgetWindows=new Map();
ipcMain.handle('window:widget',async(event,kind)=>{
  const owner=trustedWindow(event);
  if((owner!==mainWindow&&owner!==helpPanel)||!['timer','checklist'].includes(kind))throw new Error('Invalid widget request.');
  const existing=widgetWindows.get(kind);
  if(existing&&!existing.isDestroyed()){if(existing.isMinimized())existing.restore();existing.show();existing.focus();return;}
  const area=screen.getDisplayMatching(owner.getBounds()).workArea;
  const panel=new BrowserWindow({width:Math.min(kind==='timer'?320:380,area.width),height:Math.min(kind==='timer'?290:540,area.height),minWidth:280,minHeight:kind==='timer'?260:300,frame:false,transparent:true,hasShadow:false,resizable:true,alwaysOnTop:true,maximizable:false,fullscreenable:false,title:'Acumen '+kind,backgroundColor:'#00000000',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,preload:path.join(__dirname,'widget-preload.cjs')}});
  widgetWindows.set(kind,panel);attachEdgeSnap(panel,screen);
  panel.webContents.setWindowOpenHandler(()=>({action:'deny'}));panel.webContents.on('will-navigate',e=>e.preventDefault());
  panel.on('closed',()=>widgetWindows.delete(kind));
  await panel.loadURL(surfaceUrl('?widget='+kind));
});
let plannerWindow=null;
ipcMain.handle('window:planner', event => {
  const owner = trustedWindow(event);
  if (owner !== mainWindow && owner !== helpPanel) throw new Error('Only Acumen windows can open the planner.');
  if (plannerWindow) { if (plannerWindow.isMinimized()) plannerWindow.restore(); plannerWindow.show(); plannerWindow.focus(); return; }
  const area = screen.getDisplayMatching(owner.getBounds()).workArea;
  plannerWindow = new BrowserWindow({ width: Math.min(1120, area.width), height: Math.min(820, area.height), minWidth: Math.min(400, area.width), minHeight: Math.min(420, area.height), title: 'Acumen Planner', frame: false, transparent: true, hasShadow: false, maximizable: false, fullscreenable: false, autoHideMenuBar: true, backgroundColor: '#00000000', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'planner-preload.cjs') } });
  attachEdgeSnap(plannerWindow,screen);
  plannerWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  plannerWindow.webContents.on('will-navigate', event => event.preventDefault());
  plannerWindow.on('closed', () => { plannerWindow = null; });
  plannerWindow.loadURL(surfaceUrl('?planner-window=1'));
});
let appearanceWindow=null;
ipcMain.handle('window:appearance',event=>{
  const owner=trustedWindow(event);
  if(appearanceWindow){appearanceWindow.show();appearanceWindow.focus();return;}
  appearanceWindow=new BrowserWindow({width:380,height:360,title:'Appearance',parent:owner,autoHideMenuBar:true,backgroundColor:'#26332e',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  appearanceWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  appearanceWindow.webContents.on('will-navigate',event=>event.preventDefault());
  appearanceWindow.on('closed',()=>{appearanceWindow=null;});
  appearanceWindow.loadURL(surfaceUrl('?appearance-window=1'));
});
ipcMain.handle('window:compact', (event, compact) => {
  if (typeof compact !== 'boolean') throw new Error('Invalid window mode');
  const window = trustedWindow(event);
  const bounds = window.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  if(compact&&!expandedSizes.has(window))expandedSizes.set(window,{width:bounds.width,height:bounds.height});
  const saved=expandedSizes.get(window)??{width:468,height:490};
  const width = Math.min(compact ? 368 : saved.width, area.width);
  const height = Math.min(compact ? 90 : saved.height, area.height);
  window.setMinimumSize(compact?300:Math.min(380,area.width),compact?90:Math.min(360,area.height));
  window.setResizable(!compact);
  if(!compact)expandedSizes.delete(window);
  window.setBounds({ x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)), width, height });
  return compact;
});
ipcMain.handle('window:pinned', (event, pinned) => {
  if (typeof pinned !== 'boolean') throw new Error('Invalid pin state');
  const owner=trustedWindow(event);owner.setAlwaysOnTop(pinned);
  if(owner===mainWindow)helpPanel?.setAlwaysOnTop(pinned);
  return pinned;
});
ipcMain.on('window:minimize', event => trustedWindow(event).minimize());
ipcMain.on('window:close', event => trustedWindow(event).close());
ipcMain.handle('window:session',(event,id)=>{
  const owner=trustedWindow(event);if(owner!==mainWindow)throw new Error('Only the main window owns a session.');
  if(id!==null&&(typeof id!=='string'||!/^[\w-]{1,80}$/.test(id)))throw new Error('Invalid session.');
  if(closing)throw new Error('The app is closing.');
  lastSession=id;
});
for(const method of ['status','request','ensure','openSettings']){
  ipcMain.handle('permissions:'+method,(event,kind)=>{const owner=trustedWindow(event);if(owner!==mainWindow&&!(owner===helpPanel&&['status','ensure'].includes(method)))throw new Error('This window cannot manage device permissions.');return permissions[method](kind);});
}
ipcMain.handle('presage:status', event => { trustedWindow(event); return presage.status(); });
ipcMain.handle('presage:start', (event, options) => { trustedWindow(event); return presage.start(event.sender, options); });
ipcMain.handle('presage:stop', event => { trustedWindow(event); return presage.stop(); });
ipcMain.handle('presage:frame', (event, frame) => { trustedWindow(event); return presage.frame(event.sender, frame); });
ipcMain.handle('presage:idle', event => { trustedWindow(event); return powerMonitor.getSystemIdleTime(); });
ipcMain.handle('help:session',(event,id)=>{trustedWindow(event);if(id!==null&&(typeof id!=='string'||!/^[\w-]{1,80}$/.test(id)))throw new Error('Invalid session.');if(id)lastSession=id;if(helpSession!==id){notifier.reset();closeHelpPanel();help.stop();}helpSession=id;return help.status();});
function activeHelp(event){const window=trustedWindow(event);if(!helpSession)throw new Error('Start a session manually first.');return window;}
ipcMain.handle('help:notify',(event,checkin)=>{if(activeHelp(event)!==mainWindow)throw new Error('Only the session window sends check-ins.');return notifier.notify(checkin);});
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
const captureScreen=()=>require('./capture-screen.cjs').captureScreen({permissions,screen,desktopCapturer});
ipcMain.handle('help:screen',async event=>{
  activeHelp(event);
  return help.send('video',await captureScreen());
});
ipcMain.handle('help:snapshot',async event=>{
  const owner=trustedWindow(event);
  if(owner!==helpPanel)activeHelp(event);
  return captureScreen();
});
ipcMain.handle('app:open',async(event,name)=>{
 const owner=trustedWindow(event);if(owner!==mainWindow&&owner!==helpPanel)throw new Error('Only Acumen chat can open apps.');
 return launchApp(name);
});
ipcMain.handle('browser:open',async(event,value)=>{
  const owner=trustedWindow(event);
  if(owner!==mainWindow&&owner!==helpPanel)throw new Error('Only Acumen chat can open websites.');
  const {websiteUrl}=await import('../shared/website-request.js');
  const url=websiteUrl(value);
  try{await shell.openExternal(url,{activate:true});}
  catch{throw new Error('Could not open your browser. Check your default browser and try again.');}
});
ipcMain.handle('google:open',async(event,value)=>{
  trustedWindow(event);
  await openGoogleLink(value,shell);
});
ipcMain.handle('help:reveal',event=>{const window=activeHelp(event);window.show();window.flashFrame(true);});

app.whenReady().then(async () => {
  guide=require('./guide.cjs').createGuide({app,BrowserWindow,ipcMain,screen,desktopCapturer,globalShortcut,systemPreferences,shell,permissions,launchTarget,apiUrl:()=>development?'http://127.0.0.1:3001':appUrl,authorize:event=>{const owner=trustedWindow(event);if(owner!==mainWindow&&owner!==helpPanel)throw new Error('Only Acumen chat can start guidance.');}});
  if (development) {
    appUrl = 'http://127.0.0.1:5173';
  } else {
    const { createApp } = await import('../server/app.js');
    await new Promise((resolve, reject) => {
      backend = createApp({googleAuthOptions:{getPort:()=>server.address().port}});
      server = backend.listen(0, '127.0.0.1', resolve);
      server.on('error', reject);
    });
    appUrl = 'http://127.0.0.1:' + server.address().port;
  }
  installMediaPermissions(session.defaultSession,{origin:new URL(appUrl).origin,permissions,allowedContents:contents=>contents===mainWindow?.webContents||contents===helpPanel?.webContents});
  createWindow();
  let timerCheckPending=false,lastTimerAlert=null;
  const timerWatch=setInterval(async()=>{
    if(timerCheckPending||closing||shutdownComplete)return;
    timerCheckPending=true;
    try{
      const response=await fetch((development?'http://127.0.0.1:3001':appUrl)+'/api/widgets/timer');
      if(!response.ok)return;const timer=await response.json();
      if(timer.status==='completed'&&timer.endsAt&&timer.endsAt!==lastTimerAlert){
        lastTimerAlert=timer.endsAt;
        if(Notification.isSupported())new Notification({title:'Acumen · Timer complete',body:timer.title+' is finished. Take a moment before your next task.'}).show();
        shell.beep();widgetWindows.get('timer')?.flashFrame(true);
      }
    }catch{}finally{timerCheckPending=false;}
  },2000);
  app.once('will-quit',()=>clearInterval(timerWatch));
  powerMonitor.on('suspend', () => { help.stop();void presage.stop().catch(console.error); });
  app.on('activate', () => {
    if (!closing && !shutdownComplete && BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  console.error(error);
  shutdownComplete=true;
  dialog.showErrorBox('Acumen could not start',error.message);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', event => {
  if(shutdownComplete)return;
  event.preventDefault();void closeApplication();
});
