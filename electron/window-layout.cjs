function snapBounds(bounds,area,{threshold=20,gap=8}={}){
  const next={...bounds};
  const left=area.x+gap,right=area.x+area.width-bounds.width-gap;
  const top=area.y+gap,bottom=area.y+area.height-bounds.height-gap;
  if(Math.abs(bounds.x-left)<=threshold)next.x=left;
  else if(Math.abs(bounds.x-right)<=threshold)next.x=right;
  if(Math.abs(bounds.y-top)<=threshold)next.y=top;
  else if(Math.abs(bounds.y-bottom)<=threshold)next.y=bottom;
  return next;
}
function attachEdgeSnap(window,screen){
  let timer;
  const snap=()=>{
    if(window.isDestroyed()||window.isMaximized()||window.isMinimized())return;
    const bounds=window.getBounds(),next=snapBounds(bounds,screen.getDisplayMatching(bounds).workArea);
    if(next.x!==bounds.x||next.y!==bounds.y)window.setPosition(next.x,next.y);
  };
  const moved=()=>{clearTimeout(timer);timer=setTimeout(snap,180);timer.unref?.();};
  window.on('moved',moved);
  window.once('closed',()=>{clearTimeout(timer);window.removeListener('moved',moved);});
}
module.exports={snapBounds,attachEdgeSnap};
