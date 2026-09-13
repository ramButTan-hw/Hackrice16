import * as musicRequest from '../shared/music-request.js';
import {googleOpenRequest,savedGoogleResult} from './google-open-request.js';
import {prepareGoogleConfirmation} from './google-confirmation.js';
import {appRequest} from '../shared/app-request.js';
import {guideRequest,openGuide} from './guide-request.js';
import {widgetRequest,openWidget} from './widget-request.js';
import {websiteRequest,openWebsite} from './website-request.js';
import {isPlannerRequest,openPlanner} from './planner-request.js';
import {isBreakRequest,endForBreak,BREAK_REPLY} from './break-request.js';
import {shouldCaptureScreen} from './screen-request.js';
import GoogleActions,{openGoogle} from './GoogleActions.jsx';
import {useEffect,useRef,useState} from 'react';
import {openMicrophone} from './help-audio.js';
import {utterance} from './utterance.js';
import {isDismissal} from './dismiss-intent.js';
import {jsonResponse,streamReply} from './companion-api.js';
export default function CompanionChat({sessionId,initialText='',listenId=0,visible=true,onAction=()=>{}}){
  const [messages,setMessages]=useState([]),[draft,setDraft]=useState(''),[phase,setPhase]=useState('idle'),[error,setError]=useState(''),[share,setShare]=useState(false),[remember,setRemember]=useState(true),[memoryStatus,setMemoryStatus]=useState(''),[memories,setMemories]=useState(null);
  const [proposals,setProposals]=useState([]),[google,setGoogle]=useState({connected:false}),[connecting,setConnecting]=useState(false);
  const conversation=useRef(crypto.randomUUID());
  const recorder=useRef(null),generation=useRef(0),request=useRef(null),busy=useRef(false),recording=useRef(false),timer=useRef(null),log=useRef(null),callbacks=useRef({}),follow=useRef(false);
  const visibleRef=useRef(visible);visibleRef.current=visible;
  callbacks.current={startRecording,send,onAction};
  useEffect(()=>{if(!visible){clearTimeout(timer.current);follow.current=false;if(recording.current)stopRecording();}},[visible]);
  useEffect(()=>{conversation.current=crypto.randomUUID();setProposals([]);void refreshGoogle();setMessages([]);setDraft('');setError('');setPhase('idle');fetch('/api/companion/config').then(jsonResponse).then(c=>setMemoryStatus(c.memory?'Backboard ready':'Backboard not configured')).catch(()=>{});
    return()=>{generation.current++;request.current?.abort();clearTimeout(timer.current);recorder.current?.close();recorder.current=null;recording.current=false;busy.current=false;};
  },[sessionId]);
  useEffect(()=>{if(!listenId)return;const t=setTimeout(()=>void callbacks.current.startRecording(),200);return()=>clearTimeout(t);},[listenId]);
  useEffect(()=>{log.current?.scrollTo(0,log.current.scrollHeight);},[messages,initialText,phase,proposals]);
  async function send(text=draft,captureOnce=false){
    text=text.trim();if(busy.current)return;if(!text){stopRecording();return;}
    if(recording.current){const resume=follow.current;stopRecording();follow.current=resume;}
    if(musicRequest.isFirstPlaylistRequest(text)){
      const voice=follow.current;stopRecording();busy.current=true;setPhase('thinking');setError('');const token=generation.current;
      try{
        const play=window.helpPanel?.playFirstPlaylist??window.helpBridge?.playFirstPlaylist;
        if(!play)throw new Error('Restart the Jarvis desktop app to enable playlist playback.');
        const result=await play(voice);if(token!==generation.current)return;
        setDraft('');setMessages(previous=>[...previous,{role:'user',text},{role:'model',text:result.started?'I opened YouTube Music. The guide is finding your first playlist and starting it; it will pause if sign-in or your help is needed.':'Playlist startup was stopped.'}]);
      }catch(e){if(token===generation.current){setError(e.message);setDraft(text);}}
      finally{if(token===generation.current){busy.current=false;setPhase('idle');}}
      return;
    }
    if(googleOpenRequest(text)){
      const saved=savedGoogleResult(proposals);stopRecording();busy.current=true;setError('');const token=generation.current;
      try{
        if(!saved)throw new Error(proposals.some(p=>p.status==='preview')?'This is still a preview. Say “confirm” to save it before opening in Google.':'There isn’t a saved Google item in this conversation to open yet.');
        await openGoogle(saved.result.url);if(token!==generation.current)return;
        setDraft('');setMessages(previous=>[...previous,{role:'user',text},{role:'model',text:`Opened “${saved.title}” in Google.`}]);
      }catch(e){if(token===generation.current){setError(e.message);setDraft(text);}}
      finally{if(token===generation.current){busy.current=false;setPhase('idle');}}
      return;
    }
    const pending=proposals.find(p=>p.status==='preview');
    if(pending&&/^(yes|confirm|confirm it|yes please|save it|create it|do it|approve)[.! ]*$/i.test(text)){await performGoogle(pending,'confirm');return;}
    if(pending?.kind.endsWith('_slides')&&/^(generate|add|create)( the)? (images|illustrations)[.! ]*$/i.test(text)){await performGoogle(pending,'illustrate');return;}
    if(pending&&/^(cancel|cancel it|cancel that|no|no thanks)[.! ]*$/i.test(text)){await performGoogle(pending,'cancel');return;}
    const guide=guideRequest(text);if(guide){
      const voice=follow.current;stopRecording();setError('');
      try{await openGuide(guide.goal,voice);setDraft('');setMessages(previous=>[...previous,{role:'user',text},{role:'model',text:'Screen guidance is open. Review each step before letting Jarvis act.'}]);}catch(e){setError(e.message);}
      return;
    }
    const widget=widgetRequest(text);if(widget){await showWidget(text,widget);return;}
    const website=websiteRequest(text);if(website){await showWebsite(text,website);return;}
    if(isPlannerRequest(text)){await showPlanner(text);return;}
    const app=appRequest(text);if(app){
      stopRecording();busy.current=true;setError('');
      try{const launch=window.helpPanel?.openApp??window.helpBridge?.openApp;if(!launch)throw new Error('Restart the Jarvis desktop app to open installed apps.');const result=await launch(app);setDraft('');setMessages(previous=>[...previous,{role:'user',text},{role:'model',text:`Opened ${result.name}.`}]);}
      catch(e){setError(e.message);setDraft(text);}finally{busy.current=false;setPhase('idle');}
      return;
    }
    if(isBreakRequest(text)){await takeBreak(text);return;}
    if(isDismissal(text)){stopRecording();onAction('close');return;}
    busy.current=true;setPhase('thinking');setError('');const token=generation.current;
    const user={role:'user',text:text.slice(0,2000)},history=[...messages.slice(-6).map(m=>({role:m.role,text:m.text.slice(0,2000)})),user];
    while(history.reduce((s,m)=>s+m.text.length,0)>6000&&history.length>1)history.splice(0,2);
    const base=[...messages,user];setMessages([...base,{role:'model',text:''}]);setDraft('');
    const controller=new AbortController();request.current=controller;const timeout=setTimeout(()=>controller.abort(),55000);
    try{
      let screenshot;
      if(shouldCaptureScreen(text,{sharing:share,once:captureOnce})){const capture=window.helpPanel?.snapshot??window.helpBridge?.snapshot;if(!capture)throw new Error('Screen capture requires the desktop app. Uncheck Screen to continue.');screenshot=await capture();}
      if(token!==generation.current)return;
      controller.signal.throwIfAborted();
      let answer='';const result=await streamReply({messages:history,sessionId,screenshot,memory:remember,conversationId:conversation.current,activeDeckId:[...proposals].reverse().find(p=>p.result?.id&&p.kind.endsWith('_slides'))?.result.id,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone},delta=>{if(token!==generation.current)return;answer+=delta;setMessages([...base,{role:'model',text:answer}]);},controller.signal);
      if(token!==generation.current)return;
      let generated;
      if(result.imageRequest){
        clearTimeout(timeout);setPhase('imaging');
        const imageTimeout=setTimeout(()=>controller.abort(),70000);
        try{generated=await fetch('/api/images/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result.imageRequest),signal:controller.signal}).then(jsonResponse);}finally{clearTimeout(imageTimeout);}
        if(token!==generation.current)return;
      }
      setMessages([...base,{role:'model',text:generated?'Here’s your generated image.':result.text,...(generated?{image:generated.image,imagePrompt:result.imageRequest.prompt}:{})}]);setMemoryStatus('Memory '+result.memoryStatus+' · '+result.recalled+' recalled');
      if(result.proposals?.length){
        clearTimeout(timeout);
        setProposals(result.proposals);
        for(let i=0;i<result.proposals.length;i++){
          const proposal=result.proposals[i];
          if(proposal.generateImages&&proposal.slides?.some((s,n)=>s.imagePrompt&&!proposal.images?.[n])){
            setPhase('imaging');
            try{result.proposals[i]=await fetch('/api/google/actions/'+proposal.id+'/illustrate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversationId:conversation.current}),signal:controller.signal}).then(jsonResponse);}
            catch(e){if(token===generation.current)setError('The slide preview is ready, but illustrations failed: '+e.message);}
          }
        }
        if(token!==generation.current)return;
        for(const old of proposals.filter(p=>p.status==='preview'))void fetch('/api/google/actions/'+old.id+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversationId:conversation.current})}).catch(()=>{});setProposals(result.proposals);}
      if(result.launch){
        stopRecording();let name;
        if(result.launch.kind==='website'){await openWebsite(result.launch.target);name=new URL(result.launch.target).hostname;}
        else{const launch=window.helpPanel?.openApp??window.helpBridge?.openApp;if(!launch)throw new Error('Restart Jarvis to open installed apps.');name=(await launch(result.launch.target)).name;}
        if(token!==generation.current)return;setMessages([...base,{role:'model',text:`Opened ${name}.`}]);
      }
      if(result.widget){stopRecording();await openWidget({...result.widget,autoStart:true});if(token!==generation.current)return;setMessages([...base,{role:'model',text:`Your ${result.widget.kind} is open${result.widget.action?' and saved':''}.`}]);}
      if(result.uiAction==='open_planner'){stopRecording();await openPlanner();if(token!==generation.current)return;setMessages([...base,{role:'model',text:'Your planner is open.'}]);}
      if(result.action==='break_start'){await endForBreak(sessionId);if(token!==generation.current)return;setMessages([...base,{role:'model',text:BREAK_REPLY}]);onAction('break_start');}
      if(result.action==='close'){follow.current=false;onAction('close');}
    }catch(e){if(token===generation.current){follow.current=false;setMessages(messages);setDraft(user.text);setError(e.name==='AbortError'?'Reply timed out. Your message is ready to retry.':e.message);}}
    finally{clearTimeout(timeout);if(token===generation.current){busy.current=false;setPhase('idle');if(follow.current){timer.current=setTimeout(()=>void callbacks.current.startRecording(),700);}else onAction('idle');}}
  }
  async function showWidget(text,widget){
    stopRecording();busy.current=true;setError('');const token=generation.current;
    try{await openWidget({...widget,autoStart:true});if(token!==generation.current)return;setDraft('');setMessages(previous=>[...previous,{role:'user',text},{role:'model',text:`Your ${widget.kind} is open${widget.action?' and saved':''}.`}]);}
    catch(e){if(token===generation.current){setError(e.message);setDraft(text);}}
    finally{if(token===generation.current){busy.current=false;setPhase('idle');}}
  }
  async function showWebsite(text,url) {
    stopRecording();busy.current=true;setError('');const token=generation.current;
    try{await openWebsite(url);if(token!==generation.current)return;setDraft('');setMessages(previous=>[...previous,{role:'user',text},{role:'model',text:`Opened ${new URL(url).hostname} in your browser.`}]);}
    catch(e){if(token===generation.current){setError(e.message);setDraft(text);}}
    finally{if(token===generation.current){busy.current=false;setPhase('idle');}}
  }
  async function showPlanner(text) {
    stopRecording();busy.current=true;setError('');const token=generation.current;
    try { await openPlanner(); if(token!==generation.current)return;setDraft('');setMessages(previous=>[...previous,{role:'user',text},{role:'model',text:'Your planner is open.'}]); }
    catch(e){if(token===generation.current){setError(e.message);setDraft(text);}}
    finally{if(token===generation.current){busy.current=false;setPhase('idle');}}
  }
  async function openGoogleResult(url){stopRecording();await openGoogle(url);}
  async function takeBreak(text){
    busy.current=true;setPhase('thinking');setError('');const token=generation.current;
    try{await endForBreak(sessionId);if(token!==generation.current)return;setMessages(previous=>[...previous,{role:'user',text},{role:'model',text:BREAK_REPLY}]);setDraft('');onAction('break_start');}
    catch(e){if(token===generation.current){setError(e.message);setDraft(text);follow.current=false;}}
    finally{if(token===generation.current){busy.current=false;setPhase('idle');if(follow.current)timer.current=setTimeout(()=>void callbacks.current.startRecording(),700);else onAction('idle');}}
  }
  async function startRecording(){
    if(!visibleRef.current||busy.current||recording.current)return;
    clearTimeout(timer.current);follow.current=true;recording.current=true;onAction('listening');setPhase('microphone');setError('');const token=generation.current;
    const endpoint=utterance();let acceptAfter=Infinity;
    const fail=e=>{if(token!==generation.current)return;stopRecording();setError('Microphone unavailable. You can type instead. '+e.message);};
    try{
      const stream=await openMicrophone(pcm=>{if(!recording.current||Date.now()<acceptAfter)return;const result=endpoint(pcm);if(result)void finishRecording(result.audio,token);},fail);
      if(token!==generation.current||!recording.current){stream.close();return;}
      recorder.current=stream;
      const tone=stream.context.createOscillator(),gain=stream.context.createGain();gain.gain.value=.035;tone.frequency.value=720;tone.connect(gain);gain.connect(stream.context.destination);tone.start();tone.stop(stream.context.currentTime+.1);
      acceptAfter=Date.now()+220;setPhase('recording');
      timer.current=setTimeout(()=>{if(token===generation.current)stopRecording();},47000);
    }catch(e){fail(e);}
  }
  async function finishRecording(audio,token){
    if(!recording.current||token!==generation.current)return;
    clearTimeout(timer.current);recorder.current?.close();recorder.current=null;recording.current=false;
    if(!audio){follow.current=false;setPhase('idle');onAction('idle');return;}
    busy.current=true;setPhase('transcribing');
    const controller=new AbortController();request.current=controller;const timeout=setTimeout(()=>controller.abort(),25000);
    try{
      const data=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':'audio/wav'},body:audio,signal:controller.signal}).then(jsonResponse);
      if(token!==generation.current)return;busy.current=false;setDraft(data.text);await callbacks.current.send(data.text.replace(/^hey[ ,]+jarvis[,.!? ]*/i,''));
    }catch(e){if(token===generation.current){follow.current=false;busy.current=false;setPhase('idle');onAction('idle');setError(e.name==='AbortError'?'Transcription timed out. Say hey Jarvis to try again, or type.':e.message);}}
    finally{clearTimeout(timeout);}
  }
  function stopRecording(){clearTimeout(timer.current);follow.current=false;recording.current=false;recorder.current?.close();recorder.current=null;setPhase('idle');onAction('idle');}
  const query=sessionId?'?sessionId='+encodeURIComponent(sessionId):'';
  async function loadMemory(){try{setMemories((await fetch('/api/memories'+query).then(jsonResponse)).memories);}catch(e){setError(e.message);}}
  async function forget(id){try{await fetch('/api/memories/'+encodeURIComponent(id)+query,{method:'DELETE'}).then(jsonResponse);await loadMemory();}catch(e){setError(e.message);}}
  async function refreshGoogle(){try{setGoogle(await fetch('/api/google/status').then(jsonResponse));}catch{}}
  useEffect(()=>{const refresh=()=>void refreshGoogle();window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
  useEffect(()=>{if(!connecting)return;const timer=setInterval(()=>void refreshGoogle(),2000);const timeout=setTimeout(()=>setConnecting(false),120000);return()=>{clearInterval(timer);clearTimeout(timeout);};},[connecting]);
  useEffect(()=>{if(google.connected&&connecting){setConnecting(false);setMessages(list=>[...list,{role:'model',text:'Google is connected. Review your preview, then say “confirm” to save it.'}]);}},[google.connected,connecting]);
  async function connectGoogle(){stopRecording();try{const data=await fetch('/api/google/connect',{method:'POST'}).then(jsonResponse);await openGoogle(data.url);setConnecting(true);}catch(e){setError(e.message);}}
  async function disconnectGoogle(){stopRecording();try{await fetch('/api/google/disconnect',{method:'POST'}).then(jsonResponse);await refreshGoogle();}catch(e){setError(e.message);}}
  async function attachImage(message,selection){
    const [id,index]=selection.split(':');if(!id||busy.current)return;
    stopRecording();busy.current=true;setPhase('thinking');setError('');const token=generation.current;
    try{const updated=await fetch('/api/google/actions/'+id+'/image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversationId:conversation.current,index:Number(index),image:message.image,prompt:(message.imagePrompt||'Generated illustration').slice(0,1000)})}).then(jsonResponse);if(token===generation.current)setProposals(list=>list.map(p=>p.id===id?updated:p));}
    catch(e){if(token===generation.current)setError(e.message);}
    finally{if(token===generation.current){busy.current=false;setPhase('idle');}}
  }
  async function performGoogle(proposal,operation){
    if(busy.current)return;const resume=follow.current;stopRecording();busy.current=true;setPhase('thinking');setError('');const token=generation.current;
    try{
      if(operation==='confirm'){
        const connection=await prepareGoogleConfirmation({open:openGoogle,connecting,onStatus:setGoogle});
        if(token!==generation.current)return;
        if(!connection.ready){
          setConnecting(true);setDraft('');follow.current=false;
          setMessages(list=>[...list,{role:'user',text:'Confirm this preview.'},{role:'model',text:connection.opened?'Google isn’t connected yet. I opened sign-in in your browser. Your preview is kept here; finish connecting, then say “confirm” to save.':'Finish Google sign-in in your browser, then say “confirm” again. Your preview is still here.'}]);
          return;
        }
      }
      const result=await fetch('/api/google/actions/'+proposal.id+'/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversationId:conversation.current,sessionId,memory:remember})}).then(jsonResponse);
      if(token!==generation.current)return;setProposals(list=>list.map(p=>p.id===proposal.id?result:p));
      const text=operation==='illustrate'?'Illustrations are ready. Review the slide previews, then confirm to save.':result.status==='done'?'Saved in Google: '+result.title:result.status==='cancelled'?'Cancelled. Nothing was saved.':result.error||'Check Google for the result.';
      setMessages(list=>[...list,{role:'user',text:operation==='illustrate'?'Generate illustrations.':operation==='confirm'?'Confirm this preview.':'Cancel this preview.'},{role:'model',text}]);
      follow.current=resume&&result.status!=='uncertain';
    }catch(e){if(token===generation.current){setError(e.message);follow.current=false;}}
    finally{if(token===generation.current){busy.current=false;setPhase('idle');if(follow.current)timer.current=setTimeout(()=>void callbacks.current.startRecording(),700);else onAction('idle');}}
  }
  const status=phase==='recording'?'Listening':phase==='transcribing'?'Understanding…':phase==='imaging'?'Generating image…':phase==='thinking'?'Working on it…':phase==='microphone'?'Getting ready…':'Ready when you are';
  return <>
    <div ref={log} className="voice-transcript" role="log" aria-live="polite">
      {initialText&&<div className="ai-message model"><span className="ai-message-label">CHECK-IN</span><p>{initialText}</p></div>}
      {messages.map((m,i)=><div className={'ai-message '+m.role} key={i}>{m.role==='model'&&<span className="ai-message-label">JARVIS</span>}<p>{m.text||'Thinking…'}</p>{m.image&&<figure className="generated-image"><img src={m.image} alt={m.imagePrompt||'AI-generated image'}/><figcaption>AI-generated · <a href={m.image} download={'jarvis-image-'+i+(m.image.startsWith('data:image/jpeg')?'.jpg':'.png')}>Download image</a></figcaption>{proposals.some(p=>p.status==='preview'&&p.slides)&&<select aria-label="Add generated image to slide" value="" disabled={busy.current} onChange={e=>void attachImage(m,e.target.value)}><option value="">Add to a slide…</option>{proposals.filter(p=>p.status==='preview'&&p.slides).flatMap(p=>p.slides.map((slide,n)=><option key={p.id+':'+n} value={p.id+':'+n}>{p.title} · Slide {n+1}: {slide.title}</option>))}</select>}</figure>}</div>)}
      {!initialText&&!messages.length&&<div className="ai-empty"><span className="ai-spark">✦</span><h2>What can we work on?</h2><p>Ask aloud or type below.<br/>I can help with what’s on your screen.</p><div className="google-shortcuts"><button type="button" onClick={()=>void send('Give me a concise summary of my screen.',true)}>Summarize screen</button><button type="button" onClick={()=>void send('Guide me')}>Guide me</button><button type="button" onClick={()=>void send('Turn the current screen into study notes in a Google Doc.',true)}>Study notes</button><button type="button" onClick={()=>void send('Turn the current screen into a checklist in a Google Doc.',true)}>Make a checklist</button></div></div>}
      <GoogleActions onOpen={openGoogleResult} proposals={proposals} busy={busy.current} connected={google.connected} connecting={connecting} onIllustrate={p=>void performGoogle(p,'illustrate')} onConfirm={p=>void performGoogle(p,'confirm')} onCancel={p=>void performGoogle(p,'cancel')} onConnect={()=>void connectGoogle()}/>
    </div>
    {error&&<p className="voice-error" role="alert">{error}</p>}
    <div className="ai-status" role="status"><div className={'assistant-orb '+(phase==='recording'?'listening':'')} aria-hidden="true"><i/><i/><i/><i/><i/></div><span>{status}</span><small>{phase==='recording'?'Pause to send':phase==='idle'?'Say “hey Jarvis”':''}</small></div>
    <form className="companion-compose" onSubmit={e=>{e.preventDefault();void send();}}>
      <div className="ai-input"><textarea onFocus={()=>{if(recording.current)stopRecording();}} aria-label="Message Jarvis" rows={1} maxLength={2000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Ask Jarvis anything…" disabled={phase!=='idle'} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/><button className="ai-send" aria-label="Send message" title="Send · Enter" disabled={phase!=='idle'||!draft.trim()}>↑</button></div>
      <div className="ai-bottom"><button className="ai-listen" type="button" disabled={busy.current} onClick={()=>recording.current?stopRecording():void startRecording()}>{phase==='recording'?'Ⅱ Pause':'◉ Listen'}</button><label className={'ai-screen '+(share?'enabled':'')} title="Send a screenshot with your next question"><input type="checkbox" checked={share} disabled={phase!=='idle'} onChange={e=>setShare(e.target.checked)}/><span>{share?'Screen shared':'Share screen'}</span></label><details className="ai-settings"><summary aria-label="Companion settings" title="Settings and memory">•••</summary><div className="ai-settings-panel"><div className="google-connection"><strong>Google Workspace</strong><p>{google.connected?google.email:connecting?'Finish sign-in in your browser':'Create Docs, Slides and work blocks'}</p><button type="button" disabled={busy.current} onClick={()=>void (google.connected?disconnectGoogle():connectGoogle())}>{google.connected?'Disconnect Google':connecting?'Connect again':'Connect Google'}</button></div><label><input type="checkbox" checked={remember} disabled={phase!=='idle'} onChange={e=>setRemember(e.target.checked)}/> Remember work context</label><p>{memoryStatus||'Preferences and progress across sessions.'}</p><button type="button" onClick={()=>void loadMemory()}>View saved memories</button>{initialText&&<div className="ai-feedback"><span>How’s it going?</span><button type="button" onClick={()=>onAction('fine')}>Doing fine</button><button type="button" onClick={()=>onAction('tired')}>Feeling tired</button></div>}{messages.length>1&&<button type="button" onClick={()=>onAction('helpful')}>This helped</button>}</div></details></div>
    </form>
    {memories&&<div className="memory-list"><header><strong>Saved memories</strong><button aria-label="Close memories" onClick={()=>setMemories(null)}>×</button></header>{!memories.length&&<p>No saved memories yet.</p>}{memories.map(m=><div key={m.id??m.memory_id}><p>{m.content}</p><button onClick={()=>void forget(m.id??m.memory_id)}>Forget</button></div>)}</div>}
  </>;
}
