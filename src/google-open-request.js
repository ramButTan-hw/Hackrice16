export function googleOpenRequest(text){
 const value=String(text).trim().replace(/^(?:hey\s+)?(?:jarvis|acumen)[,! ]*/i,'').replace(/[.!?]+$/,'').trim();
 const match=value.match(/^(?:(?:please|can you|could you|would you)\s+)?open\s+(?:(?:it|that|this|the (?:document|doc|slides|presentation|event))\s+)?in\s+google(?:\s+please)?$/i);
 if(match)return true;
 return /^(?:(?:please|can you|could you|would you)\s+)?open\s+(?:it|that|the (?:document|doc|slides|presentation|event))(?:\s+please)?$/i.test(value);
}
export function savedGoogleResult(proposals){
 return [...proposals].reverse().find(p=>['done','uncertain'].includes(p.status)&&typeof p.result?.url==='string'&&p.result.url);
}
