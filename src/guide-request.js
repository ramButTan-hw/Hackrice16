export function guideRequest(text){
 const value=String(text).trim().replace(/^(?:hey\s+)?(?:jarvis|acumen)[,! ]*/i,'');
 const match=value.match(/^(?:(?:please|can you|could you) )?(?:guide me|show me where to click|take over)(?:\s+(?:to|through|with))?[,: ]*(.*)$/i);
 return match?{goal:match[1].trim().slice(0,1000)}:null;
}
export async function openGuide(goal,voice=false){
 const open=window.companionWindow?.guide??window.helpPanel?.guide;
 if(!open)throw new Error('Restart the Acumen desktop app to use screen guidance.');
 return open(goal,voice);
}
