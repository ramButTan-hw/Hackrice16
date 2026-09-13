import {jsonResponse} from './companion-api.js';
export const BREAK_REPLY='Your work session has ended and monitoring is off. Take your time—do you need anything else before you step away?';
export function isBreakRequest(text){
  const value=String(text).toLowerCase().replace(/’/g,"'");
  if(/\b(don't|do not|not|should|would|if|maybe)\b/.test(value))return false;
  return /\b(i (need|want|have) (to (take |have )?)?(a )?break|i'm (taking|going to take) (a )?break|i am (taking|going to take) (a )?break|let'?s (take|have) (a )?break)\b/.test(value)||/^(please )?(take a break|start (my|a) break|break time)( please)?[.!? ]*$/.test(value);
}
export async function endForBreak(id){
  if(!id)throw new Error('Start a work session before ending it for a break.');
  return fetch('/api/sessions/'+id+'/end',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:'break'})}).then(jsonResponse);
}
