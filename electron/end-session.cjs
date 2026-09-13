// Called from Electron before its windows/backend are destroyed, never from unload.
async function endSessionOnClose(baseUrl,id,{fetcher=fetch}={}){
  if(!id)return;
  const url=baseUrl+'/api/sessions/'+encodeURIComponent(id);
  const options=()=>({signal:AbortSignal.timeout(10000)});
  const response=await fetcher(url+'/end',{...options(),method:'POST'});
  if(response.ok)return;
  // A manual Stop or an earlier close request may already have committed.
  if(response.status===409){
    const current=await fetcher(url,options());
    if(current.ok&&(await current.json()).status==='ended')return;
  }
  throw new Error('Could not save the end of your session. Check the backend connection, then close the app again.');
}
async function finishSessionAndStop(baseUrl,id,{stop=async()=>{},fetcher=fetch,cleanupMs=2000}={}){
  // Persist before native cleanup: a hung SDK must not keep the session timer active.
  await endSessionOnClose(baseUrl,id,{fetcher});
  let timer;
  try{await Promise.race([Promise.resolve().then(stop).catch(()=>{}),new Promise(resolve=>{timer=setTimeout(resolve,cleanupMs);})]);}
  finally{clearTimeout(timer);}
}
module.exports={endSessionOnClose,finishSessionAndStop};
