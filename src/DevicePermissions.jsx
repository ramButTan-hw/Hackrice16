import {useEffect,useState} from 'react';
const bridge=window.devicePermissions;
export default function DevicePermissions(){
  const [state,setState]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function refresh(){try{setState(await bridge.status());}catch(e){setError(e.message);}}
  useEffect(()=>{if(!bridge)return;void refresh();window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
  if(!bridge||state?.platform!=='darwin')return null;
  async function act(kind,settings){setBusy(true);setError('');try{if(settings)await bridge.openSettings(kind);else await bridge.request(kind);await refresh();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <details className="details"><summary>Device permissions</summary><div className="detail-body">
    <p>Camera supports biometrics and attention. Microphone supports spoken input. Screen access is used when you request screen help.</p>
    {['camera','microphone','screen'].map(kind=><div className="device-permission" key={kind}><span>{kind==='screen'?'Screen Recording':kind==='camera'?'Camera':'Microphone'} · {state[kind]}</span><button type="button" disabled={busy||state[kind]==='granted'} onClick={()=>act(kind,state[kind]!=='not-determined')}>{state[kind]==='granted'?'Allowed':state[kind]==='not-determined'?'Allow':'Open Settings'}</button></div>)}
    <p>Enable Electron during development, or Jarvis for an installed app. After changing access in System Settings, fully quit and reopen the app. Resume the camera or restart the demo to retry.</p>
    {error&&<p role="alert">{error}</p>}
  </div></details>;
}
