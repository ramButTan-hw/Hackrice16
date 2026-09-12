// Local endpointing: silence never uploads a recording. Keep a little lead-in.
export function utterance({silenceMs=1400,waitMs=12000,maxMs=45000}={}){
  let elapsed=0,voiced=0,quiet=0,frames=[],lead=[],done=false;
  return pcm=>{
    if(done)return null;
    const ms=pcm.length/16;elapsed+=ms;
    const rms=Math.sqrt(pcm.reduce((sum,v)=>sum+v*v,0)/pcm.length)/32768;
    if(rms>=.012){if(!voiced){frames.push(...lead);lead=[];}voiced+=ms;quiet=0;}
    else quiet+=ms;
    if(voiced)frames.push(pcm.slice());else{lead.push(pcm.slice());while(lead.length>10)lead.shift();}
    if(voiced>0&&voiced<300&&quiet>=silenceMs){voiced=0;frames=[];lead=[];}
    if((voiced>=300&&quiet>=silenceMs)||elapsed>=maxMs||(!voiced&&elapsed>=waitMs)){
      done=true;return {audio:voiced>=300?wavBlob(frames):null};
    }
    return null;
  };
}
export function wavBlob(frames){
  const count=frames.reduce((n,f)=>n+f.length,0),bytes=new ArrayBuffer(44+count*2),view=new DataView(bytes);
  const text=(at,value)=>[...value].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
  text(0,'RIFF');view.setUint32(4,36+count*2,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,count*2,true);
  let offset=44;for(const f of frames)for(const sample of f){view.setInt16(offset,sample,true);offset+=2;}
  return new Blob([bytes],{type:'audio/wav'});
}
