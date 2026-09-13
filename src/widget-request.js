import {jsonResponse} from './companion-api.js';
export function widgetRequest(text){
  const value=String(text).trim().replace(/^(?:hey\s+)?jarvis[,! ]*/i,'').replace(/[.!?]+$/,'').trim();
  if(/^(?:(?:please|can you|could you) )?(?:open|show)(?: me)? (?:my |the |a )?(timer|pomodoro|checklist)(?: widget)?$/i.test(value))return {kind:/checklist/i.test(value)?'checklist':'timer'};
  const timer=value.match(/^(?:(?:please|can you|could you) )?(?:start|set)(?: a| an| my)? (?:(\d+|one|five|ten|fifteen|twenty five)[ -]minute )?(timer|pomodoro)(?: for (\d+) minutes?)?$/i);
  if(timer){const words={one:1,five:5,ten:10,fifteen:15,'twenty five':25};return {kind:'timer',action:'start',minutes:Number(words[timer[1]]??timer[1]??timer[3]??25)};}
  const control=value.match(/^(?:(?:please|can you|could you) )?(pause|resume|reset) (?:my |the )?(?:timer|pomodoro)$/i);
  if(control)return {kind:'timer',action:control[1].toLowerCase()};
  const list=value.match(/^(?:create|make)(?: me)? (?:a |my )?checklist:\s*(.+)$/i);
  if(list)return {kind:'checklist',action:'add',items:list[1].split(/,|;/).map(s=>s.trim()).filter(Boolean)};
  return null;
}
export async function openWidget(request,surface=window){
  if(!['timer','checklist'].includes(request?.kind))throw new Error('Unknown widget.');
  const native=surface.helpPanel?.widget??surface.companionWindow?.widget;
  if(!native&&(surface.helpPanel||surface.companionWindow))throw new Error('Restart Jarvis to enable widgets.');
  if(request.kind==='timer'&&request.autoStart&&!request.action)request={...request,action:'ensure_running'};
  if(request.action)await fetch('/api/widgets/'+request.kind,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)}).then(jsonResponse);
  if(native)await native(request.kind);
  else {const popup=surface.open('/?widget='+request.kind,'jarvis-'+request.kind);if(!popup)throw new Error('Allow pop-ups to open the widget. Your changes are saved.');popup.opener=null;}
}
