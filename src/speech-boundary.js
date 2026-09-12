// Help the server finalize a spoken reply without waiting indefinitely on noise.
export function speechBoundary(){
  let voicedMs=0,quietMs=0;
  return pcm=>{
    const ms=pcm.length/16;
    const rms=Math.sqrt(pcm.reduce((sum,v)=>sum+v*v,0)/pcm.length)/32768;
    if(rms>=.008){voicedMs+=ms;quietMs=0;return false;}
    if(!voicedMs)return false;
    quietMs+=ms;
    if(quietMs<1000)return false;
    const ended=voicedMs>=160;voicedMs=0;quietMs=0;return ended;
  };
}
