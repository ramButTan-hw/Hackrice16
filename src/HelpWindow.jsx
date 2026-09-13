import {useEffect,useState} from 'react';
import {useTheme} from './themes.jsx';
import CompanionChat from './CompanionChat.jsx';
export default function HelpWindow(){
  useTheme();const [state,setState]=useState(null);
  useEffect(()=>{document.title='Acumen companion';document.documentElement.classList.add('voice-overlay');let active=true;const off=window.helpPanel?.subscribe(setState);window.helpPanel?.ready().then(s=>{if(active)setState(s);});const escape=e=>{if(e.key==='Escape')window.helpPanel?.action('close');};window.addEventListener('keydown',escape);return()=>{active=false;off?.();window.removeEventListener('keydown',escape);document.documentElement.classList.remove('voice-overlay');};},[]);
  return <main className="voice-window"><header className="voice-toolbar"><span className="voice-drag"><span className="voice-dot"/> Acumen <small>Your work companion</small></span><button aria-label="Close assistance" onClick={()=>window.helpPanel?.action('close')}>×</button></header>{state&&<CompanionChat sessionId={state.sessionId} initialText={state.transcript} initialEvidence={state.evidence} greeting={state.greeting} responseContext={state.responseContext} listenId={state.listenId} onAction={value=>window.helpPanel?.action(value)}/>}</main>;
}
