// A model's approximate point must never be used to select unverified text.
exports.groundWord=function(step,matches){
 const valid=(Array.isArray(matches)?matches:[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);
 // Accessibility can expose both a cell and its child for the same control.
 const points=valid.filter((p,i)=>!valid.slice(0,i).some(q=>Math.hypot(p.x-q.x,p.y-q.y)<.002));
 if(!points.length)throw new Error(`Could not locate “${step.target}” in the screenshot. Make the word visible, then refresh.`);
 const ranked=points.map(p=>({...p,d:Math.hypot(p.x-step.x,p.y-step.y)})).sort((a,b)=>a.d-b.d);
 if(ranked.length>1&&(ranked[0].d>.12||ranked[1].d-ranked[0].d<.025))throw new Error(`More than one “${step.target}” is visible. Clarify which occurrence to select.`);
 return {...step,x:ranked[0].x,y:ranked[0].y};
};
