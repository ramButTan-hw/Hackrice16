import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fail } from '../shared/contracts.js';

// One dedicated assistant per local installation. Demo and real memories never mix.
export function memoryService({apiKey=process.env.BACKBOARD_API_KEY, fetcher=fetch, path='data/backboard-assistants.json'}={}) {
  let ids, creating;
  async function request(route, method='GET', body) {
    if (!apiKey) fail('Backboard memory is not configured. Add BACKBOARD_API_KEY and restart.',503);
    let r;
    try { r=await fetcher('https://app.backboard.io/api'+route,{method,headers:{'X-API-Key':apiKey,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(3500)}); }
    catch { fail('Backboard memory is temporarily unavailable.',502); }
    if(!r.ok) fail('Backboard memory request failed. Check your key and quota.',502);
    if(r.status===204)return {};
    return r.json();
  }
  async function assistant(source) {
    const scope=source==='demo'?'demo':'real';
    if(!ids){try{ids=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;ids={};}}
    if(ids[scope])return ids[scope];
    if(creating){await creating;return assistant(source);}
    creating=(async()=>{const a=await request('/assistants','POST',{name:'Work companion '+scope,system_prompt:'Store user-stated work preferences and task progress. Never infer health conditions.'});
      if(typeof a.assistant_id!=='string')throw new Error('Backboard returned no assistant ID.');
      ids[scope]=a.assistant_id;await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(ids));
    })();
    try{await creating;}finally{creating=null;}
    return ids[scope];
  }
  async function route(source){return '/assistants/'+encodeURIComponent(await assistant(source))+'/memories';}
  return {
    configured:Boolean(apiKey),
    async search(query,source){const data=await request(await route(source)+'/search','POST',{query:query.slice(0,2500),limit:5});return (data.memories??[]).map(m=>({id:m.id??m.memory_id,content:String(m.content).slice(0,1000)}));},
    async list(source){const data=await request(await route(source)+'?page=1&page_size=50');return data.memories??[];},
    async save(content,source,metadata={}){if(typeof content!=='string'||!content.trim()||content.length>2000)fail('Memory must be 1–2000 characters.');return request(await route(source),'POST',{content,metadata:{...metadata,source:source==='demo'?'demo':'real'}});},
    async remove(id,source){if(typeof id!=='string'||! /^[\w-]{1,100}$/.test(id))fail('Invalid memory ID.');return request(await route(source)+'/'+encodeURIComponent(id),'DELETE');},
  };
}
