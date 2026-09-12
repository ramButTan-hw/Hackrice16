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

export function createApp({ repository = configuredRepository(), now = Date.now, monitorOptions = {} } = {}) {
  const app = express();
  const memory=memoryService();
  const sessions = sessionService(repository, now);
  const monitor = monitoringService({ sessions, now, ...monitorOptions });
  app.locals.close = async () => { await monitor.close(); repository.close(); };
  app.disable('x-powered-by');
  app.use(express.json({ limit: '3mb' }));
  // This is a loopback-only, single-user backend. Reject cross-origin browser writes.
  app.use('/api', (request, response, next) => {
    const origin = request.get('origin');
    if (origin && origin !== `http://${request.get('host')}` && origin !== 'http://127.0.0.1:5173' && origin !== 'http://127.0.0.1:4173') return response.status(403).json({ error: 'Origin not allowed.' });
    next();
  });
  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, node: process.versions.node, storage: repository.kind });
  });
  let chatPending = false;
  let transcriptionPending=false;
  app.post('/api/transcribe',express.raw({type:'audio/*',limit:'8mb'}),async(req,res)=>{
    if(transcriptionPending)return res.status(429).json({error:'A transcription is already in progress.'});
    transcriptionPending=true;try{res.json(await transcribe(req.body,req.get('content-type')));}finally{transcriptionPending=false;}
  });
  app.get('/api/companion/config',(_req,res)=>res.json({transcription:Boolean(process.env.ELEVENLABS_API_KEY),memory:memory.configured}));
  const memorySource=async req=>req.query.sessionId?(await sessions.get(req.query.sessionId)).source:'real';
  app.get('/api/memories',async(req,res)=>res.json({memories:await memory.list(await memorySource(req))}));
  app.delete('/api/memories/:id',async(req,res)=>res.json(await memory.remove(req.params.id,await memorySource(req))));
  app.post('/api/chat/stream',async(req,res)=>{
    if(chatPending)return res.status(429).json({error:'A reply is already in progress.'});
    chatPending=true;
    const controller=new AbortController();const cancel=()=>controller.abort();res.on('close',cancel);
    res.setHeader('Content-Type','application/x-ndjson');res.setHeader('Cache-Control','no-store');
    const send=data=>{if(!res.destroyed)res.write(JSON.stringify(data)+'\n');};
    try{const result=await generateReply({...req.body,speak:false},{sessions,memory,signal:controller.signal,onText:text=>send({text})});send({done:true,...result});}
    catch(e){send({error:e.status?e.message:'Reply interrupted. Please try again.'});}
    finally{chatPending=false;res.removeListener('close',cancel);res.end();}
  });
  app.post('/api/chat', async (req, res) => {
    if (chatPending) return res.status(429).json({ error: 'A reply is already in progress.' });
    chatPending = true;
    try { res.json(await generateReply(req.body, { sessions, memory })); }
    finally { chatPending = false; }
  });
  app.get('/api/sessions', async (_req, res) => res.json(await sessions.list()));
  app.post('/api/sessions', async (req, res) => {const s=await sessions.start(req.body);await monitor.configure(s.id,{enabled:true,voice:false});res.status(201).json(await sessions.get(s.id));});
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
  app.post('/api/sessions/:id/end', async (req, res) => { await monitor.stop(req.params.id); res.json(await sessions.end(req.params.id)); });
  app.get('/api/sessions/:id/summary', async (req, res) => res.json(await sessions.summary(req.params.id)));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url))));
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Server error.' });
  });
  return app;
}
