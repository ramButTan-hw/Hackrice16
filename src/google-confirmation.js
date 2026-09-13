import {jsonResponse} from './companion-api.js';
// Check current auth before saving; a preview can be prepared while disconnected.
export async function prepareGoogleConfirmation({fetcher=fetch,open,connecting=false,onStatus=()=>{}}){
 const status=await fetcher('/api/google/status').then(jsonResponse);onStatus(status);
 if(status.connected)return {ready:true};
 if(connecting)return {ready:false,opened:false};
 const connection=await fetcher('/api/google/connect',{method:'POST'}).then(jsonResponse);
 await open(connection.url);
 return {ready:false,opened:true};
}
