import {useState} from 'react';
export async function openGoogle(url){
  const open=window.plannerWindow?.openGoogle??window.helpPanel?.openGoogle??window.helpBridge?.openGoogle;
  if(open)return open(url);
  window.open(url,'_blank','noopener,noreferrer');
}
export default function GoogleActions({proposals,busy,connected,connecting=false,onConfirm,onCancel,onConnect,onIllustrate,onOpen}){
  const [linkError,setLinkError]=useState(null);
  async function openResult(proposal) {
    setLinkError(null);
    try { await (onOpen ?? openGoogle)(proposal.result.url); }
    catch (error) { setLinkError({id:proposal.id,message:error.message}); }
  }
  return <div className="google-actions">{proposals.map(p=><article className="google-action" key={p.id}>
    <span className="ai-message-label">{p.status==='done'?'SAVED IN GOOGLE':p.status==='cancelled'?'CANCELLED':p.status==='uncertain'?'CHECK GOOGLE':p.kind.endsWith('_slides')?'GOOGLE SLIDES PREVIEW':p.kind.endsWith('doc')?'GOOGLE DOC PREVIEW':'CALENDAR PREVIEW'}</span>
    <h3>{p.title}</h3>
    {p.kind==='update_slides'&&<p className="google-preview-hint">Confirm replaces this deck’s contents with the complete preview below, keeping the same link. Review all slides; edits made directly in Google may be replaced.</p>}
    {p.slides&&<p>{p.theme||'green'} theme · {Object.keys(p.images??{}).length} images embedded in this preview</p>}
    {p.targetUrl&&<p>Update to an existing Acumen item</p>}
    {p.slides&&<div className="slide-previews">{p.slides.map((slide,index)=><section className="slide-preview" key={index}><small>SLIDE {index+1}</small><h4>{slide.title}</h4><ul>{slide.bullets.map((bullet,n)=><li key={n}>{bullet}</li>)}</ul>{p.images?.[index]?<figure><img src={p.images[index]} alt={slide.imagePrompt}/><figcaption>AI-generated illustration</figcaption></figure>:slide.imagePrompt&&<p className="slide-image-prompt">Suggested illustration: {slide.imagePrompt}</p>}</section>)}</div>}
    {p.status==='preview'&&p.slides?.some((s,i)=>s.imagePrompt&&!p.images?.[i])&&<button type="button" disabled={busy} onClick={()=>onIllustrate(p)}>{busy?'Working…':'Generate illustrations'}</button>}
    {p.content&&<pre>{p.content}</pre>}
    {p.start&&<p>{new Date(p.start).toLocaleString(undefined,{timeZone:p.timeZone})} → {new Date(p.end).toLocaleTimeString(undefined,{timeZone:p.timeZone,hour:'numeric',minute:'2-digit'})}<br/>{p.timeZone} · Acumen work sessions</p>}
    {p.previousStart&&<small>Previously: {new Date(p.previousStart).toLocaleString(undefined,{timeZone:p.timeZone})}</small>}
    {p.description&&<p>{p.description}</p>}
    {p.error&&<p role="alert">{p.error}</p>}
    {p.result?.url&&<><button type="button" onClick={()=>void openResult(p)}>Open in Google ↗</button><p className="google-preview-hint">Say “open in Google” to open your latest saved item.</p></>}
    {linkError?.id===p.id&&<div role="alert"><p>{linkError.message}</p><label>Google link<input className="google-link-fallback" readOnly value={p.result.url} onFocus={e=>e.target.select()}/></label></div>}
    {p.status==='preview'&&<><p className="google-preview-hint">{connected?'Review this preview. Say “confirm” to save the first action, or ask for changes.':connecting?'Finish Google sign-in in your browser, then say “confirm” to save.': 'Google isn’t connected. Say “confirm” or use the button below to open sign-in. Your preview will stay here.'}</p><div className="google-action-buttons">{connected?<button type="button" disabled={busy} onClick={()=>onConfirm(p)}>Confirm</button>:<button type="button" disabled={busy} onClick={onConnect}>Connect Google to save</button>}<button type="button" disabled={busy} onClick={()=>onCancel(p)}>Cancel</button></div></>}
  </article>)}</div>;
}
