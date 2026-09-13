const path=require('node:path');
const {guideVoiceCommand}=require('../shared/guide-voice.cjs');
const {pathToFileURL}=require('node:url');
const {validateStep,screenPoint,assertFresh}=require('../shared/guide-step.cjs');
const {groundWord}=require('../shared/guide-target.cjs');
const {createInput}=require('./guide-input.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
exports.createGuide=function({app,BrowserWindow,ipcMain,screen,desktopCapturer,globalShortcut,systemPreferences,shell,permissions,authorize,apiUrl,launchTarget=async()=>{throw new Error('Opening apps and websites is unavailable.');},fetcher=fetch,inputDriver=createInput(app),wait=delay}){
 const input=inputDriver;let panel,marker,run,hidden=[],voiceEpoch=0;
 const idle=()=>({started:false,goal:'',busy:false});let state=idle();
 const trusted=event=>{if(event.sender!==panel?.webContents||event.senderFrame!==event.sender.mainFrame)throw new Error('Only the guide window may approve a step.');};
 const current=token=>run===token&&!token.controller.signal.aborted;
 function publish(){if(panel&&!panel.isDestroyed())panel.webContents.send('guide:state',{...state,voiceEpoch});return {...state,voiceEpoch};}
 function stop(){
  voiceEpoch++;run?.controller.abort();run=null;input.stop();globalShortcut.unregister('Escape');
  const old=panel;panel=null;old?.destroy();marker?.destroy();marker=null;
  for(const window of hidden)if(!window.isDestroyed())window.showInactive();hidden=[];state=idle();
 }
 function show(){if(panel&&!panel.isDestroyed())panel.showInactive();}
 async function snapshot(display){
  const selected=screen.getAllDisplays().find(d=>d.id===display.id);
  if(!selected||JSON.stringify(selected.bounds)!==JSON.stringify(display.bounds))throw new Error('The display changed. Stop and reopen guidance.');
  const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:1920,height:1920}});
  const source=sources.find(s=>s.display_id===String(display.id))||(sources.length===1&&screen.getAllDisplays().length===1?sources[0]:null);
  if(!source||source.thumbnail.isEmpty())throw new Error('Could not read this display. Stop and try again.');
  return source.thumbnail;
 }
 function highlight(step,display){
  marker?.hide();if(!['click','double_click','type','scroll'].includes(step.action))return;
  const point=screenPoint(step,display.bounds);
  marker.setBounds({x:point.x-34,y:point.y-34,width:72,height:72});marker.showInactive();
  // Keep the review controls away from the highlighted target.
  const area=display.workArea,size=panel.getSize();
  panel.setPosition(Math.round(step.x>.5?area.x+18:area.x+area.width-size[0]-18),Math.round(area.y+area.height-size[1]-18));
 }
 async function next(goal,verifyOnly=false){
  if(state.busy)return state;
  if(typeof goal!=='string'||!goal.trim()||goal.length>1000)throw new Error('Describe a task in 1–1000 characters.');
  const token=run;if(!token)return state;
  if(state.step){token.history.push(state.step);token.history=token.history.slice(-4);}
  voiceEpoch++;token.pending=null;state={...state,started:true,goal:goal.trim(),busy:true,step:null,executed:false,canExecute:false,error:'',retryable:false};publish();marker.hide();
  try{
   await permissions.ensure('screen');if(!current(token))return state;
   if(!hidden.length){hidden=BrowserWindow.getAllWindows().filter(w=>w!==panel&&w!==marker&&w.isVisible());hidden.forEach(w=>w.hide());}
   let status=null,helperError='';
   try{status=await input.run({action:'status',ownerPid:process.pid,display:token.display.bounds},token.controller.signal);}catch(e){helperError=e.message;}
   if(!current(token))return state;
   panel.hide();await wait(180);if(!current(token))return state;
   // Re-read foreground after our UI is hidden; a helper compile may have taken time.
   if(status)status=await input.run({action:'status',ownerPid:process.pid,display:token.display.bounds},token.controller.signal);
   if(status?.pid&&status.pid!==process.pid)await input.run({action:'restore',pid:status.pid,ownerPid:process.pid},token.controller.signal);
   if(!current(token))return state;
   const image=await snapshot(token.display),capturedAt=Date.now();if(!current(token))return state;
   show();
   const response=await fetcher(apiUrl()+'/api/guide/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({goal:state.goal,history:token.history,conversation:token.conversation,takeover:state.takeover===true,verifyOnly,screenshot:image.toJPEG(70).toString('base64')}),signal:token.controller.signal});
   const value=await response.json();if(!response.ok)throw new Error(value.error||'Guidance unavailable.');
   if(!current(token))return state;
   let step=validateStep(value);
   if(step.action==='double_click'){
    const located=await input.run({action:'locate_word',word:step.target,image:image.toJPEG(90).toString('base64')},token.controller.signal);
    if(!current(token))return state;
    step=groundWord(step,located.matches);
   }
   if(step.action==='click'&&status?.trusted){
    const located=await input.run({action:'locate_control',label:step.target,pid:status.pid},token.controller.signal);
    if(!current(token))return state;
    const b=token.display.bounds;
    const points=(located.matches||[]).map(p=>({x:(p.x-b.x)/b.width,y:(p.y-b.y)/b.height})).filter(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);
    if(points.length)step=groundWord(step,points);
   }
   token.pending={step,image,at:capturedAt,bounds:token.display.bounds,pid:status?.pid};
   state={...state,busy:false,step,canExecute:['open_website','open_app'].includes(step.action)||(['click','double_click','type','scroll'].includes(step.action)&&Boolean(status?.trusted&&status.pid&&status.pid!==process.pid)),needsPermission:process.platform==='darwin'&&!status?.trusted,error:helperError};
   state.blockedReason=step.action==='manual'?'This step needs your input. Tell me what to clarify or complete it yourself.':step.action==='done'?'The task is complete.':state.canExecute?'':helperError||(!status?.trusted?'Enable macOS Accessibility, then refresh the step.':'Bring the target app forward, then refresh the step.');
   highlight(step,token.display);publish();
  }catch(e){if(current(token)){token.pending=null;state={...state,busy:false,step:null,error:e.message};show();publish();}}
  return state;
 }
 async function execute(){
  const token=run,pending=token?.pending;
  if(!pending||state.busy||!state.canExecute||!['click','double_click','type','scroll','open_website','open_app'].includes(pending.step.action))throw new Error('Get a fresh step before approving an action.');
  // Consume approval before awaiting anything: double clicks cannot repeat an action.
  voiceEpoch++;token.pending=null;state={...state,busy:true};publish();marker.hide();
  try{
   assertFresh(pending,Date.now(),screen.getAllDisplays().find(d=>d.id===token.display.id));
   panel.hide();await wait(180);if(!current(token))return state;
   if(['open_website','open_app'].includes(pending.step.action)){
    await launchTarget(pending.step);if(!current(token))return state;
    state={...state,busy:false,executed:true,canExecute:false,error:''};show();return publish();
   }
   await input.run({action:'restore',pid:pending.pid,ownerPid:process.pid},token.controller.signal);
   if(!current(token))return state;
   const fresh=await snapshot(token.display);if(!current(token))return state;
   if(!sameTarget(pending.image,fresh,pending.step)){
    const error=new Error('The target moved or changed. Get a fresh step before continuing.');
    error.code='GUIDE_SCREEN_CHANGED';throw error;
   }
   assertFresh(pending,Date.now(),screen.getAllDisplays().find(d=>d.id===token.display.id));
   await input.run({...pending.step,...screenPoint(pending.step,pending.bounds),pid:pending.pid},token.controller.signal);
   if(!current(token))return state;
   state={...state,busy:false,executed:true,canExecute:false,error:''};show();publish();
  }catch(e){if(current(token)){state={...state,busy:false,canExecute:false,error:e.message,retryable:e.code==='GUIDE_SCREEN_CHANGED'};show();publish();}}
  return state;
 }
 async function takeOver(limit=8){
  if(state.busy||state.takeover)return {...state,voiceEpoch};
  if(!state.started||!state.goal.trim())return {...state,voiceEpoch,voiceMessage:'Start a task first, then say “do it for me”.'};
  const token=run;state={...state,takeover:true,takeoverMessage:'Taking over. Stop or Escape cancels.'};publish();
  // Return immediately so voice keeps listening for Stop while work continues.
  void (async()=>{
   const seen=new Set();let count=0,refreshes=0;
   try{
    // A manual suggestion contains no input to execute. Replan it once with
    // takeover intent instead of returning the same handoff immediately.
    if(state.step?.action==='manual')await next(state.goal);
    while(current(token)&&count<limit){
     if(!token.pending)await next(state.goal);
     if(!current(token))return;
     if(state.error||!state.canExecute){state={...state,takeoverMessage:state.step?.action==='done'?'Task looks complete.':state.step?.action==='manual'?'Your turn. Complete this step yourself.':state.blockedReason||'Paused. Refresh the step to try again.'};break;}
     const step=state.step,key=JSON.stringify([step.action,step.target,step.text,step.url,step.name,step.direction]);
     if(seen.has(key)){
      state={...state,takeoverMessage:'Checking whether the task is already complete…'};publish();
      await next(state.goal,true);if(!current(token))return;
      state={...state,canExecute:false,takeoverMessage:state.step?.action==='done'?'Task looks complete.':'Paused because this step is repeating. Check the screen before continuing.'};break;
     }
     seen.add(key);state={...state,takeoverMessage:`Step ${count+1} of ${limit}. ${step.instruction}`};publish();
     await wait(1000);if(!current(token))return;
     await execute();if(!current(token))return;
     if(state.error||!state.executed){
      // Only replan failures that occurred before input was sent. Never replay
      // an uncertain native action, or weaken the screenshot comparison.
      if(state.retryable&&refreshes<1){
       refreshes++;seen.delete(key);
       state={...state,takeoverMessage:'The screen changed. Finding a fresh target…'};publish();
       continue;
      }
      state={...state,takeoverMessage:state.error||'Paused. The action could not be completed.'};break;
     }
     count++;refreshes=0;await wait(700);if(!current(token))return;
     await next(state.goal);if(!current(token))return;
    }
    if(count===limit)state={...state,takeoverMessage:limit===1?'Step sent and screen checked. Review the next step.':'Completed 8 steps. Review progress, then ask me to continue if needed.'};
   }catch(e){if(current(token))state={...state,error:e.message,takeoverMessage:'Paused. Review the screen before continuing.'};}
   finally{if(current(token)){state={...state,takeover:false};publish();}}
  })();
  return {...state,voiceEpoch};
 }
 async function openGuide(event,goal,voice=false){
  authorize(event);if(panel){show();return;}
  if(typeof goal!=='string'||goal.length>1000)throw new Error('Invalid guide task.');
  const display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()),area=display.workArea;
  voiceEpoch++;state={...idle(),goal,autoVoice:voice===true};run={controller:new AbortController(),display,pending:null,history:[],conversation:[]};
  panel=new BrowserWindow({width:Math.min(360,area.width),height:Math.min(410,area.height),x:Math.round(area.x+area.width-Math.min(360,area.width)-12),y:area.y+24,frame:false,transparent:true,hasShadow:false,backgroundColor:'#00000000',alwaysOnTop:true,resizable:false,skipTaskbar:true,show:false,title:'Jarvis Guide',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required',partition:'jarvis-guide',preload:path.join(__dirname,'guide-preload.cjs')}});
  marker=new BrowserWindow({width:72,height:72,frame:false,transparent:true,hasShadow:false,backgroundColor:'#00000000',alwaysOnTop:true,focusable:false,skipTaskbar:true,show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const guideURL=pathToFileURL(path.join(__dirname,'guide.html')).href;
  const mediaSession=panel.webContents.session;
  const trustedMedia=(contents,details)=>contents===panel?.webContents&&contents.getURL()===guideURL&&details?.isMainFrame!==false;
  mediaSession.setPermissionCheckHandler((contents,permission,_origin,details)=>permission==='media'&&details?.mediaType==='audio'&&trustedMedia(contents,details));
  mediaSession.setPermissionRequestHandler((contents,permission,callback,details)=>{
   if(permission!=='media'||!trustedMedia(contents,details)||!details?.mediaTypes?.length||details.mediaTypes.some(type=>type!=='audio'))return callback(false);
   void permissions.ensure('microphone').then(()=>callback(true),()=>callback(false));
  });
  panel.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  marker.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  marker.setIgnoreMouseEvents(true);marker.setAlwaysOnTop(true,'screen-saver');
  for(const window of [panel,marker]){window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());}
  panel.on('closed',()=>{if(panel)stop();});panel.webContents.on('render-process-gone',stop);
  const activePanel=panel;await Promise.all([panel.loadFile(path.join(__dirname,'guide.html')),marker.loadFile(path.join(__dirname,'guide-marker.html'))]);
  if(panel!==activePanel)return;
  if(!globalShortcut.register('Escape',stop)){stop();throw new Error('Escape is unavailable. Close the app using it and try guidance again.');}
  panel.show();
 }
 ipcMain.handle('guide:open',openGuide);
 ipcMain.handle('music:play-first',async(event,voice=false)=>{
  authorize(event);
  const {FIRST_PLAYLIST_GOAL}=await import('../shared/music-request.js');
  if(panel)throw new Error('Stop the current guide first, then ask me to play your playlist.');
  await openGuide(event,FIRST_PLAYLIST_GOAL,voice);const token=run;
  if(!token)return {started:false};
  try{
   panel.setFocusable(false);
   await launchTarget({action:'open_website',url:'https://music.youtube.com/'});
   if(!current(token))return {started:false};
   await next(FIRST_PLAYLIST_GOAL);
   if(!current(token))return {started:false};
   await takeOver();
   return {started:true};
  }catch(e){if(current(token)){state={...state,busy:false,error:e.message};publish();}throw e;}
 });
 ipcMain.handle('guide:ready',event=>{trusted(event);return {...state,voiceEpoch};});
 ipcMain.handle('guide:set-goal',(event,goal)=>{
  trusted(event);if(state.started||state.busy)return;
  if(typeof goal!=='string'||goal.length>1000)throw new Error('Invalid task.');
  state={...state,goal:goal.trim()};voiceEpoch++;
  return {voiceEpoch};
 });
 ipcMain.handle('guide:microphone',async event=>{trusted(event);await permissions.ensure('microphone');});
 ipcMain.handle('guide:transcribe',async(event,audio)=>{
  trusted(event);const token=run;
  if(!token||token.transcribing)throw new Error('Voice is already processing.');
  if(!(audio instanceof ArrayBuffer)||audio.byteLength<100||audio.byteLength>8*1024*1024)throw new Error('Invalid voice recording.');
  token.transcribing=true;
  try{
   const response=await fetcher(apiUrl()+'/api/transcribe',{method:'POST',headers:{'Content-Type':'audio/wav'},body:Buffer.from(audio),signal:AbortSignal.any([token.controller.signal,AbortSignal.timeout(25000)])});
   const value=await response.json();
   if(!current(token))throw new Error('Guidance stopped.');
   // Silence/background noise is a normal listener outcome, not an IPC failure.
   if(response.status===422)return {text:'',noSpeech:true};
   if(!response.ok)return {error:value.error||'Voice is unavailable. Turn voice on to retry.'};
   if(typeof value.text!=='string'||!value.text.trim())return {text:'',noSpeech:true};
   return {text:value.text};
  }catch{
   return {error:'Voice connection interrupted. Turn voice on to retry.'};
  }finally{token.transcribing=false;}
 });
 ipcMain.handle('guide:voice',async(event,text,epoch)=>{
  trusted(event);const command=guideVoiceCommand(text);
  if(command?.action==='stop'){stop();return {stopped:true};}
  if(command?.action==='pause')return {...state,voiceEpoch,voicePaused:true};
  if(state.takeover)return {...state,voiceEpoch,voiceMessage:'Working through the task. Say “stop the guide” to cancel.'};
  if(!command){
   const {websiteRequest}=await import('../shared/website-request.js');
   const {appRequest}=await import('../shared/app-request.js');
   const url=websiteRequest(text),name=url?null:appRequest(text);
   if(url||name){
    if(state.busy||epoch!==voiceEpoch)return {...state,voiceEpoch,voiceMessage:'Wait for the current step, then say it again.'};
    const token=run;voiceEpoch++;token.pending=null;marker.hide();state={...state,busy:true};publish();
    try{const result=await launchTarget(url?{action:'open_website',url}:{action:'open_app',name});
     if(!current(token))return {stopped:true};
     state={...state,busy:false,started:true,goal:state.goal||text,canExecute:false,executed:false,step:{action:'manual',instruction:`Opened ${result.name}. Say “I did it” when you’re ready to continue.`},error:''};
    }catch(e){if(current(token))state={...state,busy:false,canExecute:false,error:e.message};}
    return publish();
   }
  }
  if(!command){
   if(state.busy||epoch!==voiceEpoch)return {...state,voiceEpoch,voiceMessage:'Wait for the current step, then say it again.'};
   if(typeof text!=='string'||!text.trim()||text.length>2000)return {...state,voiceEpoch,voiceMessage:'Tell me what you want to do or clarify.'};
   const reply=text.trim().slice(0,1000);
   if(state.step?.instruction)run.conversation.push({role:'guide',text:state.step.instruction});
   run.conversation.push({role:'user',text:reply});run.conversation=run.conversation.slice(-6);
   state={...state,lastReply:reply,takeoverMessage:''};
   panel.setFocusable(false);await next(state.goal||reply);return {...state,voiceEpoch};
  }
  if(state.busy||epoch!==voiceEpoch)return {...state,voiceEpoch,voiceMessage:'Wait for the current step, then say it again.'};
  if(command.action==='takeover')return takeOver();
  if(command.action==='execute'){
   if(!state.canExecute||!run?.pending)return {...state,voiceEpoch,voiceMessage:'This step needs your attention. Get a fresh step or complete it yourself.'};
   return takeOver(1);
  }
  if(command.action==='goal'){
   const started=state.started;
   run.history=[];run.conversation=[];run.pending=null;marker.hide();
   state={...state,goal:command.goal,step:null,canExecute:false,executed:false,lastReply:text,takeoverMessage:''};voiceEpoch++;
   if(started){panel.setFocusable(false);await next(command.goal);}
   return publish();
  }
  if(command.action==='start'&&state.started)return {...state,voiceEpoch,voiceMessage:'Already started. Say “I did it” for the next step.'};
  if(command.action==='next'&&!state.started)return {...state,voiceEpoch,voiceMessage:'Say “let’s start” to begin.'};
  if(!state.goal.trim())return {...state,voiceEpoch,voiceMessage:'First say “my task is…” or type your task.'};
  panel.setFocusable(false);await next(state.goal);return {...state,voiceEpoch};
 });
 ipcMain.handle('guide:takeover',event=>{trusted(event);return takeOver();});
 ipcMain.handle('guide:next',(event,goal)=>{trusted(event);if(state.takeover)return {...state,voiceEpoch};panel.setFocusable(false);return next(goal).then(()=>({...state,voiceEpoch}));});
 ipcMain.handle('guide:execute',event=>{trusted(event);if(state.takeover)return {...state,voiceEpoch};return execute().then(()=>({...state,voiceEpoch}));});
 ipcMain.handle('guide:stop',event=>{trusted(event);stop();});
 ipcMain.handle('guide:enable',async event=>{
  trusted(event);if(process.platform!=='darwin')throw new Error('Supervised input is currently macOS only.');
  systemPreferences.isTrustedAccessibilityClient(true);
  await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  state={...state,canExecute:false,error:'Allow Jarvis / Electron in Accessibility, return to your task, then get a fresh step.'};if(run)run.pending=null;return publish();
 });
 app.on('before-quit',stop);screen.on('display-removed',stop);screen.on('display-metrics-changed',()=>{if(run)stop();});
 return {stop};
};
function sameTarget(before,after,step){
 const size=before.getSize(),next=after.getSize();if(size.width!==next.width||size.height!==next.height)return false;
 const x=Math.max(0,Math.min(size.width-1,Math.floor(step.x*size.width))),y=Math.max(0,Math.min(size.height-1,Math.floor(step.y*size.height)));
 const box={x:Math.max(0,x-60),y:Math.max(0,y-40),width:Math.min(120,size.width-Math.max(0,x-60)),height:Math.min(80,size.height-Math.max(0,y-40))};
 const a=before.crop(box).toBitmap(),b=after.crop(box).toBitmap();if(a.length!==b.length||!a.length)return false;
 let changed=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>24)changed++;
 return changed/(a.length/4)<.04;
}
exports.sameTarget=sameTarget;
