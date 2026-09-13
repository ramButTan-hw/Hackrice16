// Only bounded, reviewable input actions can cross the desktop bridge.
exports.validateStep = function (value) {
  const fail=()=>{throw new Error('Acumen could not identify a safe next step. Try a more specific task.');};
  if(!value||!['click','double_click','type','scroll','manual','done','open_website','open_app'].includes(value.action))fail();
  if(typeof value.instruction!=='string'||!value.instruction.trim()||value.instruction.length>600)fail();
  const step={action:value.action,instruction:value.instruction.trim()};
  if(['click','double_click','type','scroll'].includes(step.action)){
    if(!Number.isFinite(value.x)||!Number.isFinite(value.y)||value.x<0||value.x>1||value.y<0||value.y>1)fail();
    if(typeof value.target!=='string'||!value.target.trim()||value.target.length>120)fail();
    Object.assign(step,{x:value.x,y:value.y,target:value.target.trim()});
  }
  if(step.action==='open_website'){
    try{const url=new URL(value.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!url.hostname.includes('.')||value.url.length>2048)fail();step.url=url.href;}catch{fail();}
  }
  if(step.action==='open_app'){
    if(typeof value.name!=='string'||!value.name.trim()||value.name.length>100||! /^[\p{L}\p{N}][\p{L}\p{N} .+'’_-]*$/u.test(value.name.trim()))fail();step.name=value.name.trim();
  }
  if(step.action==='type'){
    if(typeof value.text!=='string'||!value.text.length||value.text.length>300||/[\x00-\x1f\x7f]/.test(value.text))fail();
    step.text=value.text;
  }
  if(step.action==='scroll'){
    if(!['up','down'].includes(value.direction))fail();step.direction=value.direction;
  }
  return step;
};
exports.screenPoint=(step,bounds)=>({x:bounds.x+Math.min(bounds.width-1,Math.floor(step.x*bounds.width)),y:bounds.y+Math.min(bounds.height-1,Math.floor(step.y*bounds.height))});
exports.assertFresh=function(step,now,display){
  if(!step||now-step.at>30000||JSON.stringify(step.bounds)!==JSON.stringify(display?.bounds)){
    const error=new Error('The screen may have changed. Get a fresh step before continuing.');
    error.code='GUIDE_SCREEN_CHANGED';throw error;
  }
};
