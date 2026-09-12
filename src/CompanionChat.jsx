import {useEffect,useRef,useState} from 'react';
import {openMicrophone} from './help-audio.js';
import {utterance} from './utterance.js';
import {isDismissal} from './dismiss-intent.js';
import {jsonResponse,streamReply} from './companion-api.js';
export default function CompanionChat({sessionId,initialText='',listenId=0,onAction=()=>{}}){
  const [messages,setMessages]=useState([]),[draft,setDraft]=useState(''),[phase,setPhase]=useState('idle'),[error,setError]=useState(''),[share,setShare]=useState(false),[remember,setRemember]=useState(true),[memoryStatus,setMemoryStatus]=useState(''),[memories,setMemories]=useState(null);
  const recorder=useRef(null),generation=useRef(0),request=useRef(null),busy=useRef(false),recording=useRef(false),timer=useRef(null),log=useRef(null),callbacks=useRef({}),follow=useRef(false);
  callbacks.current={startRecording,send,onAction};
  useEffect(()=>{setMessages([]);setDraft('');setError('');setPhase('idle');fetch('/api/companion/config').then(jsonResponse).then(c=>setMemoryStatus(c.memory?'Backboard ready':'Backboard not configured')).catch(()=>{});
    return()=>{generation.current++;request.current?.abort();clearTimeout(timer.current);recorder.current?.close();recorder.current=null;recording.current=false;busy.current=false;};
  },[sessionId]);
  useEffect(()=>{if(!listenId)return;const t=setTimeout(()=>void callbacks.current.startRecording(),200);return()=>clearTimeout(t);},[listenId]);
  useEffect(()=>{log.current?.scrollTo(0,log.current.scrollHeight);},[messages,initialText,phase]);
  async function send(text=draft){
    text=text.trim();if(busy.current)return;if(!text){stopRecording();return;}
    if(isDismissal(text)){stopRecording();onAction('close');return;}
    busy.current=true;setPhase('thinking');setError('');const token=generation.current;
    const user={role:'user',text:text.slice(0,2000)},history=[...messages.slice(-6).map(m=>({...m,text:m.text.slice(0,2000)})),user];
    while(history.reduce((s,m)=>s+m.text.length,0)>6000&&history.length>1)history.splice(0,2);
    const base=[...messages,user];setMessages([...base,{role:'model',text:''}]);setDraft('');
    const controller=new AbortController();request.current=controller;const timeout=setTimeout(()=>controller.abort(),55000);
    try{
      let screenshot;
      if(share){const capture=window.helpPanel?.snapshot??window.helpBridge?.snapshot;if(!capture)throw new Error('Screen capture requires the desktop app. Uncheck Screen to continue.');screenshot=await capture();}
      let answer='';const result=await streamReply({messages:history,sessionId,screenshot,memory:remember},delta=>{if(token!==generation.current)return;answer+=delta;setMessages([...base,{role:'model',text:answer}]);},controller.signal);
      if(token!==generation.current)return;
      setMessages([...base,{role:'model',text:result.text}]);setMemoryStatus('Memory '+result.memoryStatus+' · '+result.recalled+' recalled');
      if(result.action==='close'){follow.current=false;onAction('close');}
    }catch(e){if(token===generation.current){follow.current=false;setMessages(messages);setDraft(user.text);setError(e.name==='AbortError'?'Reply timed out. Your message is ready to retry.':e.message);}}
    finally{clearTimeout(timeout);if(token===generation.current){busy.current=false;setPhase('idle');if(follow.current){timer.current=setTimeout(()=>void callbacks.current.startRecording(),700);}else onAction('idle');}}
  }
  async function startRecording(){
    if(busy.current||recording.current)return;
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
  const status=phase==='recording'?'Listening':phase==='transcribing'?'Understanding…':phase==='thinking'?'Working on it…':phase==='microphone'?'Getting ready…':'Ready when you are';
  return <>
    <div ref={log} className="voice-transcript" role="log" aria-live="polite">
      {initialText&&<div className="ai-message model"><span className="ai-message-label">CHECK-IN</span><p>{initialText}</p></div>}
      {messages.map((m,i)=><div className={'ai-message '+m.role} key={i}>{m.role==='model'&&<span className="ai-message-label">JARVIS</span>}<p>{m.text||'Thinking…'}</p></div>)}
      {!initialText&&!messages.length&&<div className="ai-empty"><span className="ai-spark">✦</span><h2>A little help, right here.</h2><p>Ask a question, untangle a problem,<br/>or find your next step.</p></div>}
    </div>
    {error&&<p className="voice-error" role="alert">{error}</p>}
    <div className="ai-status" role="status"><div className={'assistant-orb '+(phase==='recording'?'listening':'')} aria-hidden="true"><i/><i/><i/><i/><i/></div><span>{status}</span><small>{phase==='recording'?'Pause to send':phase==='idle'?'Say “hey Jarvis”':''}</small></div>
    <form className="companion-compose" onSubmit={e=>{e.preventDefault();void send();}}>
      <div className="ai-input"><textarea onFocus={()=>{if(recording.current)stopRecording();}} aria-label="Message Jarvis" rows={1} maxLength={2000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Or type a question…" disabled={phase!=='idle'} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/><button className="ai-send" aria-label="Send message" title="Send · Enter" disabled={phase!=='idle'||!draft.trim()}>↑</button></div>
      <div className="ai-bottom"><button className="ai-listen" type="button" disabled={busy.current} onClick={()=>recording.current?stopRecording():void startRecording()}>{phase==='recording'?'Ⅱ Pause':'◉ Listen'}</button><label className={'ai-screen '+(share?'enabled':'')} title="Send a screenshot with your next question"><input type="checkbox" checked={share} disabled={phase!=='idle'} onChange={e=>setShare(e.target.checked)}/><span>Screen {share?'on':'off'}</span></label><details className="ai-settings"><summary aria-label="Companion settings" title="Settings and memory">•••</summary><div className="ai-settings-panel"><label><input type="checkbox" checked={remember} disabled={phase!=='idle'} onChange={e=>setRemember(e.target.checked)}/> Remember work context</label><p>{memoryStatus||'Preferences and progress across sessions.'}</p><button type="button" onClick={()=>void loadMemory()}>View saved memories</button>{initialText&&<div className="ai-feedback"><span>How’s it going?</span><button type="button" onClick={()=>onAction('fine')}>Doing fine</button><button type="button" onClick={()=>onAction('tired')}>Feeling tired</button></div>}{messages.length>1&&<button type="button" onClick={()=>onAction('helpful')}>This helped</button>}</div></details></div>
    </form>
    {memories&&<div className="memory-list"><header><strong>Saved memories</strong><button aria-label="Close memories" onClick={()=>setMemories(null)}>×</button></header>{!memories.length&&<p>No saved memories yet.</p>}{memories.map(m=><div key={m.id??m.memory_id}><p>{m.content}</p><button onClick={()=>void forget(m.id??m.memory_id)}>Forget</button></div>)}</div>}
  </>;
}
