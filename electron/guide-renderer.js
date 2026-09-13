import {openMicrophone} from '../src/help-audio.js';
import {utterance} from '../src/utterance.js';
import {guideListener} from '../src/guide-listener.js';
let voiceEpoch=0,autoVoiceChecked=false,voiceNotice='';
const $=id=>document.getElementById(id);let goal='';
function voiceFeedback(message){voiceNotice=message;$('voice-feedback').hidden=!message;$('voice-feedback').textContent=message;}
const listener=guideListener({
 openMicrophone:async(...args)=>{await window.guide.microphone();return openMicrophone(...args);},utterance,
 transcribe:audio=>window.guide.transcribe(audio),command:(text,epoch)=>window.guide.voice(text,epoch),epoch:()=>voiceEpoch,
 workletUrl:new URL('../public/help-audio.js',import.meta.url).href,
 onStatus:status=>{$('listen').textContent=status==='off'?'◉ Voice on':'Ⅱ Pause voice';$('listen').setAttribute('aria-pressed',String(status!=='off'));$('voice-status').textContent=({off:'Voice off',starting:'Opening mic…',listening:'Listening',transcribing:'Understanding…'})[status];},
 onResult:state=>{if(!state.stopped)render(state);},
 onNotice:voiceFeedback,
 onError:error=>{$('voice-status').textContent='Voice unavailable';voiceFeedback(error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}
});
function render(state){
 if(Number.isInteger(state.voiceEpoch))voiceEpoch=state.voiceEpoch;
 const feedback=state.voiceMessage||voiceNotice||(state.lastReply?'You: '+state.lastReply:'');$('voice-feedback').hidden=!feedback;$('voice-feedback').textContent=feedback;
 if(state.goal)goal=state.goal;
 $('goal').value=goal;
 $('task').hidden=Boolean(state.started);
 $('step').hidden=!state.started;
 $('instruction').textContent=state.busy?'Looking at your screen…':state.step?.instruction||'Ready for the next step.';
 const action=state.step?.action;
 $('execute').hidden=state.busy||!['click','double_click','type','scroll','open_website','open_app'].includes(action)||!state.canExecute;
 $('execute').disabled=Boolean(state.executed||state.takeover);
 $('execute').textContent=state.executed?'Step sent':'Do this step';
 $('next').disabled=state.busy||state.takeover;
 $('takeover').disabled=state.busy||state.takeover;
 $('refresh').disabled=state.busy||state.takeover;
 const reason=state.busy?'':state.error||state.blockedReason||(['open_website','open_app'].includes(action)?'This step opens a target directly; no cursor is needed.':'');
 $('control-status').hidden=!reason;$('control-status').textContent=reason;
 $('takeover').textContent=state.takeover?'Working…':'Do it for me';
 $('takeover-status').hidden=!state.takeoverMessage;$('takeover-status').textContent=state.takeoverMessage||'';
 $('next').textContent=action==='done'?'Check again':state.executed?'Check result · Next':'I did it · Next';
 $('preview').hidden=!['click','double_click','type','scroll','open_website','open_app'].includes(action)||state.busy;
 $('preview').textContent=action==='open_website'?`Open website: ${state.step.url}`:action==='open_app'?`Open app: ${state.step.name}`:action==='type'?`Type into ${state.step.target}:\n“${state.step.text}”`:action==='scroll'?`Scroll ${state.step.direction} over ${state.step.target}`:action==='double_click'?`Select word: ${state.step.target}`:action==='click'?`Click ${state.step.target}`:'';
 $('error').hidden=!state.error;$('error').textContent=state.error||'';
 $('enable').hidden=!state.needsPermission;
 if(!autoVoiceChecked){autoVoiceChecked=true;if(state.autoVoice)void listener.start();}
}
async function call(method,...args){try{render(await window.guide[method](...args));}catch(e){$('error').hidden=false;$('error').textContent=e.message;}}
$('listen').onclick=()=>listener.enabled?listener.stop():void listener.start();
$('goal').oninput=()=>{goal=$('goal').value;void window.guide.setGoal(goal).then(value=>{if(value)voiceEpoch=value.voiceEpoch;}).catch(e=>{$('error').hidden=false;$('error').textContent=e.message;});};
window.addEventListener('beforeunload',()=>listener.stop());
$('task').onsubmit=e=>{e.preventDefault();goal=$('goal').value.trim();if(goal)void call('next',goal);};
$('next').onclick=()=>call('next',goal);
$('refresh').onclick=()=>call('next',goal);
$('takeover').onclick=()=>call('takeover');
$('execute').onclick=()=>call('execute');
$('enable').onclick=()=>call('enable');
$('stop').onclick=()=>{listener.stop();void window.guide.stop();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){listener.stop();void window.guide.stop();}});
window.guide.subscribe(render);void call('ready');
