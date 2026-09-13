export function appName(value){
 if(typeof value!=='string'||!value.trim()||value.length>100||! /^[\p{L}\p{N}][\p{L}\p{N} .+'’_-]*$/u.test(value.trim()))throw new Error('Use an installed app name, such as Safari or Spotify.');
 return value.trim().replace(/\.app$/i,'');
}
export function appRequest(text){
 const value=String(text).trim().replace(/^(?:hey\s+)?jarvis[,! ]*/i,'').replace(/[.!?]+$/,'').trim();
 const match=value.match(/^(?:(?:please|can you|could you|would you|will you)\s+)?(?:open|launch|start|bring up)\s+(?:the\s+)?(.+?)(?:\s+app)?(?:\s+(?:please|for me))?$/i);
 if(!match||/\b(?:and|then|to|with|in|my|a)\b/i.test(match[1])||/\b(?:timer|pomodoro|checklist|planner|schedule|session|guide)\b/i.test(match[1]))return null;
 try{return appName(match[1]);}catch{return null;}
}
