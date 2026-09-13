import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {fail} from '../shared/contracts.js';
export const GOOGLE_SCOPES=['openid','email','https://www.googleapis.com/auth/drive.file','https://www.googleapis.com/auth/calendar.app.created','https://www.googleapis.com/auth/calendar.events.freebusy'];
export function googleAuth({env=process.env,fetcher=fetch,now=Date.now,getPort=()=>Number(env.PORT||3001)}={}){
  // Tokens stay in backend memory. Reconnect Google after restarting the backend.
  let credentials=null,account=null,pending=null,refreshing=null;
  const redirect=()=>`http://127.0.0.1:${getPort()}/oauth/google/callback`;
  const configured=()=>Boolean(env.GOOGLE_CLIENT_ID);
  async function token(params){
    let r;try{r=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,...(env.GOOGLE_CLIENT_SECRET?{client_secret:env.GOOGLE_CLIENT_SECRET}:{}),...params}),signal:AbortSignal.timeout(15000)});}catch{fail('Google sign-in could not connect. Try connecting again.',502);}
    const data=await r.json().catch(()=>({}));if(!r.ok||!data.access_token)fail('Google sign-in failed. Check OAuth credentials, consent, and test-user access.',502);
    return {...data,expiresAt:now()+(data.expires_in||3600)*1000};
  }
  return {
    status:()=>({configured:configured(),connected:Boolean(credentials&&account),email:account?.email??null,accountId:account?.sub??null}),
    begin(){
      if(!configured())fail('Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from a Desktop OAuth client to .env, then restart.',503);
      const state=randomBytes(24).toString('base64url'),verifier=randomBytes(48).toString('base64url');pending={state,verifier,redirectUri:redirect(),expiresAt:now()+600000};
      const params=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:pending.redirectUri,response_type:'code',scope:GOOGLE_SCOPES.join(' '),access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
      return {url:'https://accounts.google.com/o/oauth2/v2/auth?'+params};
    },
    async callback(query){
      const state=String(query.state||'');
      if(!pending||pending.expiresAt<now()||Buffer.byteLength(state)!==Buffer.byteLength(pending.state)||!timingSafeEqual(Buffer.from(state),Buffer.from(pending.state)))fail('Google sign-in expired or did not match. Start Connect Google again.',400);
      const attempt=pending;pending=null;
      if(query.error)fail('Google access was not granted. You can reconnect from Jarvis.',400);
      if(typeof query.code!=='string'||query.code.length>4096)fail('Missing Google authorization code.');
      const next=await token({code:query.code,code_verifier:attempt.verifier,redirect_uri:attempt.redirectUri,grant_type:'authorization_code'});
      const scopes=new Set(String(next.scope||'').split(' '));
      if(!GOOGLE_SCOPES.filter(s=>s.startsWith('https:')).every(s=>scopes.has(s)))fail('Please grant both Docs/Drive and Calendar permissions when connecting Google.',403);
      const r=await fetcher('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+next.access_token},signal:AbortSignal.timeout(10000)});
      const user=await r.json();if(!r.ok||!user.sub)fail('Could not identify the connected Google account.',502);
      credentials=next;account={sub:user.sub,email:user.email};return this.status();
    },
    disconnect(){pending=null;credentials=null;account=null;},
    async request(url,method='GET',body,expectedAccount,headers={}){
      if(!credentials||!account)fail('Connect Google in the companion menu first.',401);
      const owner=account.sub;
      if(expectedAccount&&expectedAccount!==owner)fail('Google account changed. Generate a new preview for this account.',409);
      if(credentials.expiresAt<now()+60000){
        if(!credentials.refresh_token)fail('Google sign-in expired. Reconnect Google.',401);
        const refreshToken=credentials.refresh_token;
        refreshing??=token({refresh_token:refreshToken,grant_type:'refresh_token'}).then(next=>{if(account?.sub===owner)credentials={...next,refresh_token:next.refresh_token||refreshToken};}).finally(()=>{refreshing=null;});
        await refreshing;
      }
      if(!credentials||account?.sub!==owner)fail('Google connection changed. Please try again.',409);
      const parsed=new URL(url);if(!['docs.googleapis.com','slides.googleapis.com','www.googleapis.com'].includes(parsed.hostname)||parsed.protocol!=='https:')fail('Invalid Google API endpoint.');
      let r;try{r=await fetcher(url,{method,headers:{Authorization:'Bearer '+credentials.access_token,'Content-Type':'application/json',...headers},body:Buffer.isBuffer(body)?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});}catch{fail('Google did not confirm the operation. Check its status before trying again.',502);}
      if(!r.ok){const status=r.status;await r.body?.cancel();try { fail(status===401?'Google sign-in expired. Reconnect Google.':status===403?'Google denied access. Check that the APIs are enabled and the requested permissions were granted.':status===412?'This item changed in Google. Refresh it and make a new preview.':`Google request failed (HTTP ${status}).`,status===401?401:status===412?409:502); } catch (error) { error.googleStatus=status; throw error; }}
      return r.status===204?{}:r.json();
    },
  };
}
