// Acknowledge receipt before cloud persistence; never claim an unsaved answer is saved.
export async function handleFeeling(call,{send,save,onSaved,onError}){
  const allowed=call.name==='report_feeling'&&['fine','stuck','tired'].includes(call.args?.feeling);
  try{
    const accepted=await send('tool',{id:call.id,name:'report_feeling',ok:allowed,pending:allowed});
    if(!accepted)throw new Error('Voice connection could not acknowledge your reply.');
  }catch(error){onError(error);return;}
  if(!allowed)return;
  try{onSaved(await save({answer:call.args.feeling,actionId:'live-'+String(call.id).replace(/[^\w-]/g,'').slice(0,65)}));}
  catch{onError(new Error('Your reply was heard, but the check-in could not be saved. You can keep talking.'));}
}
