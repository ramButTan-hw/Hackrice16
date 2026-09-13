import { plannerCalendar } from './planner-calendar.js';
import { plannerService } from './planner.js';
import {attentionSample} from './attention.js';
import {generateImage} from './image-generation.js';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { configuredRepository } from './config.js';
import { sessionService } from './session-service.js';
import { generateReply } from './chat.js';
import { monitoringService } from './monitor.js';
import { appendEvent } from './event-log.js';
import { assistanceState, answerCheckin } from './break-score.js';
import { transcribe } from './transcription.js';
import { memoryService } from './memory.js';
import {googleAuth} from './google-auth.js';
import {googleWorkspace} from './google-workspace.js';

export function createApp({ repository = configuredRepository(), now = Date.now, monitorOptions = {}, googleAuthOptions = {} } = {}) {
  const app = express();
  const memory=memoryService();
  const google=googleAuth(googleAuthOptions),workspace=googleWorkspace({auth:google});
  const sessions = sessionService(repository, now);
  const planner = plannerService(repository, now, plannerCalendar({ auth: google, workspace }));
  const monitor = monitoringService({ sessions, now, ...monitorOptions });
  app.locals.close = async () => { await monitor.close(); repository.close(); };
  app.disable('x-powered-by');
  app.use((req,res,next)=>express.json({limit:req.path.match(/^\/api\/google\/actions\/[^/]+\/image$/)?'15mb':'3mb'})(req,res,next));
  // This is a loopback-only, single-user backend. Reject cross-origin browser writes.
  app.use('/api', (request, response, next) => {
    const origin = request.get('origin');
    if (origin && origin !== `http://${request.get('host')}` && origin !== 'http://127.0.0.1:5173' && origin !== 'http://127.0.0.1:4173') return response.status(403).json({ error: 'Origin not allowed.' });
    next();
  });
  let imagePending=false;
  app.post('/api/images/generate',async(req,res)=>{
    if(imagePending)return res.status(429).json({error:'An image is already generating. Please wait.'});
    imagePending=true;const controller=new AbortController();const cancel=()=>controller.abort();res.on('close',cancel);
    try{const image=await generateImage(req.body?.prompt,{aspectRatio:req.body?.aspectRatio||'1:1',signal:controller.signal});res.set('Cache-Control','no-store').json({image});}
    finally{imagePending=false;res.removeListener('close',cancel);}
  });
  app.get('/api/health' , (_request, response) => {
    response.json({ ok: true, node: process.versions.node, storage: repository.kind });
  });
  let chatPending = false;
  let transcriptionPending=false;
  app.post('/api/transcribe',express.raw({type:'audio/*',limit:'8mb'}),async(req,res)=>{
    if(transcriptionPending)return res.status(429).json({error:'A transcription is already in progress.'});
    transcriptionPending=true;try{res.json(await transcribe(req.body,req.get('content-type')));}finally{transcriptionPending=false;}
  });
  app.get('/api/companion/config',(_req,res)=>res.json({transcription:Boolean(process.env.ELEVENLABS_API_KEY),memory:memory.configured}));
  app.get('/api/google/status',(_req,res)=>{const {accountId,...status}=google.status();res.json(status);});
  app.post('/api/google/connect',(_req,res)=>res.json(google.begin()));
  app.post('/api/google/disconnect',(_req,res)=>{google.disconnect();res.json({connected:false});});
  app.get('/oauth/google/callback',async(req,res)=>{try{await google.callback(req.query);res.set('Content-Security-Policy',"default-src 'none'").type('html').send('<h1>Google connected</h1><p>You can close this tab and return to Jarvis.</p>');}catch(e){res.status(e.status||500).type('text').send(e.status?e.message:'Google sign-in failed. Return to Jarvis and try again.');}});
  app.get('/api/google/items',async(_req,res)=>res.json(await workspace.context()));
  app.post('/api/google/actions/:id/image',express.json({limit:'15mb'}),async(req,res)=>res.json(workspace.attachImage(req.params.id,req.body?.conversationId,req.body?.index,req.body?.image,req.body?.prompt)));
  app.post('/api/google/actions/:id/illustrate',async(req,res)=>res.json(await workspace.illustrate(req.params.id,req.body?.conversationId)));
  app.post('/api/google/actions/:id/confirm',async(req,res)=>{
    const result=await workspace.execute(req.params.id,req.body?.conversationId);
    if(result.status==='done'&&req.body?.memory!==false&&memory.configured){
        // Content stays in Google; remember the destination so future work can resume.
        void (async()=>{const source=req.body.sessionId?(await sessions.get(req.body.sessionId)).source:'real';await memory.save('Created/updated Google item: '+JSON.stringify(result.result),source,{kind:'google_item'});})().catch(()=>{});
    }
    res.json(result);
  });
  app.post('/api/google/actions/:id/cancel',(req,res)=>res.json(workspace.cancel(req.params.id,req.body?.conversationId)));
  const memorySource=async req=>req.query.sessionId?(await sessions.get(req.query.sessionId)).source:'real';
  app.get('/api/memories',async(req,res)=>res.json({memories:await memory.list(await memorySource(req))}));
  app.delete('/api/memories/:id',async(req,res)=>res.json(await memory.remove(req.params.id,await memorySource(req))));
  app.post('/api/chat/stream',async(req,res)=>{
    if(chatPending)return res.status(429).json({error:'A reply is already in progress.'});
    chatPending=true;
    const controller=new AbortController();const cancel=()=>controller.abort();res.on('close',cancel);
    res.setHeader('Content-Type','application/x-ndjson');res.setHeader('Cache-Control','no-store');
    const send=data=>{if(!res.destroyed)res.write(JSON.stringify(data)+'\n');};
    try{const result=await generateReply({...req.body,speak:false},{sessions,memory,workspace,signal:controller.signal,onText:text=>send({text})});send({done:true,...result});}
    catch(e){send({error:e.status?e.message:'Reply interrupted. Please try again.'});}
    finally{chatPending=false;res.removeListener('close',cancel);res.end();}
  });
  app.post('/api/chat', async (req, res) => {
    if (chatPending) return res.status(429).json({ error: 'A reply is already in progress.' });
    chatPending = true;
    try { res.json(await generateReply(req.body, { sessions, memory })); }
    finally { chatPending = false; }
  });
  app.get('/api/analytics/patterns', async (req, res) => res.json(await planner.patterns(req.query.timeZone || 'UTC')));
  app.get('/api/plans', async (_req, res) => res.json(await planner.list()));
  app.post('/api/plans/suggest', async (req, res) => res.json(await planner.suggest(req.body || {})));
  app.post('/api/plans', async (req, res) => res.status(201).json(await planner.create(req.body)));
  app.post('/api/plans/:id/google', async (req, res) => res.json(await planner.publish(req.params.id)));
  app.delete('/api/plans/:id', async (req, res) => res.json(await planner.remove(req.params.id)));
  app.get('/api/sessions', async (_req, res) => res.json(await sessions.list()));
  app.post('/api/sessions', async (req, res) => {const s=await sessions.start(req.body);await monitor.configure(s.id,{enabled:true,voice:false});res.status(201).json(await sessions.get(s.id));});
  app.post('/api/sessions/:id/attention',async(req,res)=>{const s=await sessions.update(req.params.id,s=>attentionSample(s,req.body,now()));res.json(s.attention);});
  app.get('/api/sessions/:id/assistance',async(req,res)=>{const s=await sessions.get(req.params.id);res.json(assistanceState(s));});
  app.post('/api/sessions/:id/assistance',async(req,res)=>{const s=await sessions.update(req.params.id,s=>{answerCheckin(s,req.body,now());appendEvent(s,now(),'assistance','answer',{answer:req.body.answer,score:s.assistance.score});});res.json(s.assistance);});
  app.get('/api/sessions/:id', async (req, res) => res.json(await sessions.get(req.params.id)));
  app.post('/api/sessions/:id/metrics', async (req, res) => res.json(await sessions.ingest(req.params.id, req.body)));
  app.get('/api/sessions/:id/state', async (req, res) => res.json(await sessions.state(req.params.id)));
  app.post('/api/sessions/:id/activity', async (req, res) => res.json(await monitor.activity(req.params.id, req.body)));
  app.post('/api/sessions/:id/monitor', async (req, res) => res.json(await monitor.configure(req.params.id, req.body)));
  app.get('/api/sessions/:id/monitor', async (req, res) => res.json(await monitor.status(req.params.id)));
  app.post('/api/sessions/:id/events', async (req, res) => {
    const { event, data } = req.body || {};
    if (!['metrics', 'validation', 'error', 'processing', 'stopped'].includes(event) || JSON.stringify(data ?? null).length > 24000) return res.status(400).json({ error: 'Invalid Presage log event.' });
    await sessions.update(req.params.id, s => appendEvent(s, now(), 'presage', event, data));
    res.json({ ok: true });
  });
  app.get('/api/sessions/:id/events', async (req, res) => {
    const s = await sessions.get(req.params.id);
    if (req.query.download === '1') res.attachment('session-events.json');
    res.json({ sessionId: s.id, retainedLimit: 180, totalEvents: s.eventSequence ?? 0, events: s.events ?? [] });
  });
  app.post('/api/sessions/:id/interventions', async (req, res) => res.status(201).json(await sessions.intervene(req.params.id, req.body)));
  app.post('/api/sessions/:id/end', async (req, res) => { const reason=req.body?.reason;if(reason!==undefined&&reason!=='break')return res.status(400).json({error:'Invalid session end reason.'});
    if(reason==='break'){const current=await sessions.get(req.params.id);if(current.status==='ended')return res.json(current);}
    await monitor.stop(req.params.id);try{res.json(await sessions.end(req.params.id,reason));}catch(error){if(reason==='break'&&error.status===409)return res.json(await sessions.get(req.params.id));throw error;} });
  app.get('/api/sessions/:id/summary', async (req, res) => res.json(await sessions.summary(req.params.id)));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url))));
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Server error.' });
  });
  return app;
}
