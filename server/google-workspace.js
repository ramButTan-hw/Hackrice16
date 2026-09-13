import {buildSlideDeck,presentationUpload,generateSlideImage} from './slide-deck.js';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fail} from '../shared/contracts.js';

const docs='https://docs.googleapis.com/v1/documents',drive='https://www.googleapis.com/drive/v3/files',cal='https://www.googleapis.com/calendar/v3';
const field=(v,max,label)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail(`Invalid ${label}.`);return v.trim();};
export function validateGoogleDraft(raw){
  const kind=raw?.kind;
  if(!['create_doc','append_doc','create_event','reschedule_event','create_slides','update_slides'].includes(kind))fail('Unsupported Google action.');
  const result={kind,title:field(raw.title,150,'title')};
  if(kind.endsWith('_slides')){
    result.theme=['green','blue','ivory'].includes(raw.theme)?raw.theme:'green';result.generateImages=raw.generateImages===true;
    if(!Array.isArray(raw.slides)||raw.slides.length<1||raw.slides.length>8)fail('Use 1 to 8 slides.');
    let illustrated=0;result.slides=raw.slides.map(slide=>{if(!Array.isArray(slide.bullets)||!slide.bullets.length||slide.bullets.length>5)fail('Use 1 to 5 bullets per slide.');return {title:field(slide.title,100,'slide title'),bullets:slide.bullets.map(b=>field(b,180,'slide bullet')),...(slide.imagePrompt&&illustrated++<2?{imagePrompt:field(slide.imagePrompt,1000,'illustration prompt')}:{})};});
  }
  if(kind.endsWith('doc')){result.content=field(raw.content,12000,'document content');result.format=raw.format==='checklist'?'checklist':'notes';}
  if(['append_doc','reschedule_event','update_slides'].includes(kind))result.targetId=field(raw.targetId,200,'selected item');
  if(kind.endsWith('event')){
    result.start=field(raw.start,50,'start time');result.end=field(raw.end,50,'end time');result.timeZone=field(raw.timeZone,80,'time zone');
    const dated=v=>/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
    if(!dated(result.start)||!dated(result.end)||Date.parse(result.end)<=Date.parse(result.start)||Date.parse(result.end)-Date.parse(result.start)>86400000)fail('Specify a valid work block of at most 24 hours with an explicit time zone offset.');
    try{new Intl.DateTimeFormat('en',{timeZone:result.timeZone});}catch{fail('Invalid time zone.');}
    result.description=typeof raw.description==='string'?raw.description.slice(0,2000):'';
  }
  return result;
}

export function googleWorkspace({auth,path='data/google-workspace.json',now=Date.now,imageGenerator=generateSlideImage}={}){
  let registry,loading,queue=Promise.resolve();const proposals=new Map();
  async function load(){if(registry)return registry;loading??=(async()=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {accounts:{},operations:{}};}})();registry=await loading;return registry;}
  async function persist(){await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(registry));await rename(path+'.tmp',path);}
  const exclusive=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
  async function owned(){await load();const owner=auth.status().accountId;if(!owner)fail('Connect Google first.',401);return {owner,state:registry.accounts[owner]??={documents:[],events:[],calendarId:null}};}
  async function target(draft,state){const items=draft.kind==='append_doc'?state.documents:draft.kind==='update_slides'?(state.presentations??[]):state.events;const item=items.find(i=>i.id===draft.targetId);if(!item)fail('Select an item created by Acumen in this Google account.',400);return item;}
  const view=p=>({id:p.id,...p.draft,expiresAt:p.expiresAt,status:p.status,result:p.result,error:p.error,images:p.images??{}});
  return {
    async plannerCalendarId(timeZone) { return exclusive(async () => {
      const { owner, state } = await owned();
      if (!state.calendarId && timeZone) {
        const calendar = await auth.request(cal + '/calendars', 'POST', { summary: 'Acumen work sessions', timeZone }, owner);
        if (!calendar.id) fail('Google did not return a calendar ID.', 502);
        state.calendarId = calendar.id; await persist();
      }
      return state.calendarId;
    }); },
    drafts(conversationId){return [...proposals.values()].filter(p=>p.conversationId===conversationId&&p.status==='preview'&&p.expiresAt>now()).slice(-3).map(view);},
    async context(){if(!auth.status().connected)return {connected:false,documents:[],events:[]};const {state}=await owned();return {connected:true,documents:state.documents.slice(-15),events:state.events.slice(-15),presentations:(state.presentations??[]).slice(-15).map(({images,...item})=>item)};},
    async propose(raw,conversationId){
      field(conversationId,100,'conversation');const draft=validateGoogleDraft(raw);
      if(draft.targetId){const {state}=await owned();const item=await target(draft,state);if(draft.kind!=='update_slides')draft.title=item.title;draft.targetUrl=item.url;
        if(draft.kind==='reschedule_event'){draft.previousStart=item.start;draft.previousEnd=item.end;}}
      for(const [id,p]of proposals)if(p.expiresAt<now()&&p.status==='preview')proposals.delete(id);
      if(proposals.size>100)fail('Too many previews. Restart the backend or finish an existing action.',429);
      const previous=[...proposals.values()].reverse().find(p=>p.conversationId===conversationId&&p.draft.kind.endsWith('_slides')&&p.status==='preview');
      let inherited=previous;
      if(draft.kind==='update_slides'){const {state}=await owned();const item=await target(draft,state);inherited=previous?.draft.targetId===draft.targetId?previous:{draft:item.draft,images:item.images};const remote=await auth.request(drive+'/'+encodeURIComponent(item.id)+'?fields=id,version',undefined,undefined,auth.status().accountId);draft.targetVersion=remote.version;}
      const images={};if(draft.slides&&inherited?.draft?.slides)draft.slides.forEach((slide,i)=>{const old=inherited.draft.slides.findIndex(s=>s.imagePrompt&&s.imagePrompt===slide.imagePrompt);if(old>=0&&inherited.images?.[old])images[i]=inherited.images[old];});
      const p={images,id:randomUUID(),conversationId,accountId:auth.status().accountId,draft,status:'preview',expiresAt:now()+20*60000};proposals.set(p.id,p);return view(p);
    },
    attachImage(id,conversationId,index,image,prompt){
      const p=proposals.get(id);if(!p||p.conversationId!==conversationId||p.status!=='preview'||p.generating||p.expiresAt<now()||!p.draft.slides?.[index])fail('Select a slide in a current preview.',409);
      if(typeof image!=='string'||image.length>14000100||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))fail('Invalid generated image.');
      const bytes=Buffer.from(image.split(',')[1],'base64');const png=image.startsWith('data:image/png');if(!(png?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255))fail('Invalid image bytes.');
      (p.images??={})[index]=image;p.draft.slides[index].imagePrompt=field(prompt,1000,'image description');return view(p);
    },
    async readDeck(id){
      const {owner,state}=await owned();const item=(state.presentations??[]).find(p=>p.id===id);if(!item)fail('Choose a Acumen-created presentation.',404);
      const remote=await auth.request('https://slides.googleapis.com/v1/presentations/'+encodeURIComponent(id),undefined,undefined,owner);
      return {id,title:remote.title,slides:(remote.slides??[]).map(page=>({texts:(page.pageElements??[]).flatMap(e=>e.shape?.text?.textElements?.map(t=>t.textRun?.content??'')??[]).join('').slice(0,3000),hasImages:(page.pageElements??[]).some(e=>e.image)})),savedDraft:item.draft};
    },
    async illustrate(id,conversationId){
      const p=proposals.get(id);if(!p||p.conversationId!==conversationId||p.status!=='preview'||p.expiresAt<now()||!p.draft.kind.endsWith('_slides'))fail('Prepare a fresh slide preview first.',409);
      if(p.generating)fail('Illustrations are already generating.',409);
      p.generating=true;p.images??={};
      try{for(const [index,slide]of p.draft.slides.entries())if(slide.imagePrompt&&!p.images[index])p.images[index]=await imageGenerator(slide.imagePrompt);return view(p);}finally{p.generating=false;}
    },
    async execute(id,conversationId){return exclusive(async()=>{
      const p=proposals.get(id);if(!p||p.conversationId!==conversationId)fail('This preview is unavailable. Ask Acumen to prepare it again.',404);
      const {owner,state}=await owned();if(p.accountId&&p.accountId!==owner)fail('Google account changed. Ask for a new preview.',409);p.accountId=owner;
      if(p.status==='done')return view(p);
      if(p.generating)fail('Wait for illustrations to finish.',409);
      if(p.status!=='preview')fail('This action already started. Check its Google link before creating another copy.',409);
      if(p.expiresAt<now())fail('The preview expired. Ask for a new one.',409);
      const d=p.draft;const item=d.targetId?await target(d,state):null;
      // Journal before external writes; never repeat a mutation on ambiguous failure.
      p.status='running';registry.operations[id]={status:'running',accountId:owner,kind:d.kind};await persist();
      const request=(url,method,body,headers)=>auth.request(url,method,body,owner,headers);
      try{
        if(d.kind.endsWith('_slides')){
          const upload=presentationUpload(d.title,id,await buildSlideDeck(d,p.images));
          if(item){const current=await request(drive+'/'+encodeURIComponent(item.id)+'?fields=id,version');if(!d.targetVersion||current.version!==d.targetVersion)fail('The deck changed after this preview. Prepare a new edit preview.',409);}
          const saved=await request('https://www.googleapis.com/upload/drive/v3/files'+(item?'/'+encodeURIComponent(item.id):'')+'?uploadType=multipart&fields=id',item?'PATCH':'POST',upload.body,upload.headers);
          if(!saved.id)throw new Error('Google returned no presentation ID.');
          p.result={id:saved.id,title:d.title,url:`https://docs.google.com/presentation/d/${saved.id}/edit`};const record={...p.result,draft:d,images:p.images??{},createdAt:item?.createdAt??now()};if(item)Object.assign(item,record);else(state.presentations??=[]).push(record);
        }else if(d.kind==='create_doc'||d.kind==='append_doc'){
          let documentId=item?.id;
          if(!documentId){const created=await request(drive+'?fields=id','POST',{name:d.title,mimeType:'application/vnd.google-apps.document',appProperties:{jarvisActionId:id}});documentId=created.id;if(!documentId)throw new Error('Google returned no document ID.');}
          p.result={id:documentId,url:`https://docs.google.com/document/d/${documentId}/edit`,title:d.title};registry.operations[id].result=p.result;await persist();
          const doc=await request(docs+'/'+encodeURIComponent(documentId));
          const content=(d.kind==='create_doc'?d.title+'\n':'\n')+d.content+'\n';
          const requests=[{insertText:{endOfSegmentLocation:{},text:content}}];
          if(d.kind==='create_doc')requests.push({updateParagraphStyle:{range:{startIndex:1,endIndex:d.title.length+1},paragraphStyle:{namedStyleType:'TITLE'},fields:'namedStyleType'}});
          await request(docs+'/'+encodeURIComponent(documentId)+':batchUpdate','POST',{requests,...(doc.revisionId?{writeControl:{requiredRevisionId:doc.revisionId}}:{})});
          if(!item)state.documents.push({...p.result,createdAt:now()});
        }else{
          if(!state.calendarId){const calendar=await request(cal+'/calendars','POST',{summary:'Acumen work sessions',description:'Work blocks created with Acumen.',timeZone:d.timeZone});state.calendarId=calendar.id;if(!calendar.id)throw new Error('Google returned no calendar ID.');await persist();}
          const base=cal+'/calendars/'+encodeURIComponent(state.calendarId)+'/events';
          const event={summary:d.title,start:{dateTime:d.start,timeZone:d.timeZone},end:{dateTime:d.end,timeZone:d.timeZone}};
          let saved;
          if(item){const current=await request(base+'/'+encodeURIComponent(item.id));saved=await request(base+'/'+encodeURIComponent(item.id),'PATCH',event,current.etag?{'If-Match':current.etag}:{});}
          else saved=await request(base,'POST',{...event,id:id.replaceAll('-',''),description:d.description,extendedProperties:{private:{jarvisActionId:id}}});
          p.result={id:saved.id,title:d.title,url:saved.htmlLink||'https://calendar.google.com/calendar/u/0/r',start:d.start,end:d.end,timeZone:d.timeZone};
          if(item)Object.assign(item,p.result);else state.events.push({...p.result,createdAt:now()});
        }
        p.status='done';registry.operations[id]={status:'done',accountId:owner,kind:d.kind,result:p.result};await persist();return view(p);
      }catch(e){p.status='uncertain';p.error=(e.status?e.message:'Google could not confirm this action.')+' Check Google before repeating it.';registry.operations[id]={status:p.status,accountId:owner,kind:d.kind,result:p.result,error:p.error};await persist();return view(p);}
    });},
    cancel(id,conversationId){const p=proposals.get(id);if(!p||p.conversationId!==conversationId)fail('Preview not found.',404);if(p.status!=='preview'||p.generating)fail('This action already started.',409);p.status='cancelled';return view(p);},
  };
}
