exports.guideVoiceCommand=function(text){
 if(typeof text!=='string'||text.length>2000)return null;
 const value=text.toLowerCase().trim().replace(/[’‘]/g,"'").replace(/^(?:hey[ ,]+)?jarvis[,! ]*/,'').replace(/[.!?,]+$/,'').trim();
 if(/^(?:let'?s start|start the guide|start guidance|start)$/.test(value))return {action:'start'};
 if(/^(?:i did it|i've done it|i have done it|done|next|next step|continue)$/.test(value))return {action:'next'};
 if(/^(?:please )?do it for me(?: please)?$/.test(value))return {action:'takeover'};
 if(/^(?:please )?do this step(?: please)?$/.test(value))return {action:'execute'};
 if(/^(?:stop|stop the guide|stop guidance|cancel guidance)$/.test(value))return {action:'stop'};
 if(/^(?:pause listening|stop listening|mute)$/.test(value))return {action:'pause'};
 const task=text.trim().match(/^(?:my task is|help me|guide me (?:through|to))\s+(.+?)[.!?]*$/i);
 if(task&&task[1].length<=1000)return {action:'goal',goal:task[1].trim()};
 return null;
};
