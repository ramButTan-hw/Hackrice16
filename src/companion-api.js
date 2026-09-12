export async function jsonResponse(response){
  const raw=await response.text();let data;
  try{data=JSON.parse(raw);}catch{throw new Error('The backend is unavailable or restarting. Try again shortly.');}
  if(!response.ok)throw new Error(data.error||'Request failed.');return data;
}
export async function streamReply(body,onText,signal){
  const response=await fetch('/api/chat/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  if(!response.ok)return jsonResponse(response);
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result;
  const consume=line=>{if(!line.trim())return;const item=JSON.parse(line);if(item.error)throw new Error(item.error);if(item.done)result=item;else if(item.text)onText(item.text);};
  try{while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let n;while((n=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,n));buffer=buffer.slice(n+1);}}buffer+=decoder.decode();if(buffer.trim())consume(buffer);}
  finally{reader.releaseLock();}
  if(!result)throw new Error('Reply was interrupted. Please try again.');return result;
}
