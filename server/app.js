import express from 'express';
import { fileURLToPath } from 'node:url';
import { configuredRepository } from './config.js';
import { sessionService } from './session-service.js';
import { generateReply } from './chat.js';
import { monitoringService } from './monitor.js';
import { appendEvent } from './event-log.js';

export function createApp({ repository = configuredRepository(), now = Date.now, monitorOptions = {} } = {}) {
  const app = express();
  const sessions = sessionService(repository, now);
  const monitor = monitoringService({ sessions, now, ...monitorOptions });
  app.locals.close = async () => { await monitor.close(); repository.close(); };
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
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
  app.post('/api/chat', async (req, res) => {
    if (chatPending) return res.status(429).json({ error: 'A reply is already in progress.' });
    chatPending = true;
    try { res.json(await generateReply(req.body, { sessions })); }
    finally { chatPending = false; }
  });
  app.get('/api/sessions', async (_req, res) => res.json(await sessions.list()));
  app.post('/api/sessions', async (req, res) => res.status(201).json(await sessions.start(req.body)));
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
