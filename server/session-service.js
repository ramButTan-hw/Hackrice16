import { randomUUID } from 'node:crypto';
import { fail, metric, text, RULES } from '../shared/contracts.js';
import { deriveState } from './state-engine.js';
import { summarize } from './analytics.js';

export function sessionService(repository, now = Date.now) {
  async function get(id) { const s = await repository.get(id); if (!s) fail('Session not found.', 404); return s; }
  async function change(id, update) {
    const s = await get(id);
    if (s.status !== 'active') fail('Session has ended.', 409);
    const revision = s.revision;
    update(s); s.revision++;
    await repository.save(s, revision);
    return s;
  }
  return {
    async start(body) {
      const goal = text(body?.goal, 'goal');
      const source = body?.source ?? 'demo';
      if (!['demo', 'presage'].includes(source)) fail('source must be demo or presage.');
      const s = { schemaVersion: 1, id: randomUUID(), revision: 0, goal, source, status: 'active', startedAt: now(), endedAt: null, baseline: null, samples: [], interventions: [] };
      await repository.insert(s); return s;
    },
    get,
    async list() { return (await repository.list()).map(s => ({ id: s.id, goal: s.goal, source: s.source, status: s.status, startedAt: s.startedAt, endedAt: s.endedAt })); },
    async ingest(id, input) {
      const s = await change(id, s => {
        if (s.samples.length >= RULES.maxSamples) fail('Session reached 3600 samples. End it and start another.', 409);
        const sample = metric(input, s.source, s.startedAt, now(), s.samples.at(-1)?.timestamp);
        s.samples.push(sample);
        sample.state = deriveState(s, sample.timestamp).state;
      });
      return { sample: s.samples.at(-1), workState: deriveState(s, now()), revision: s.revision };
    },
    async state(id) { const s = await get(id); const state = deriveState(s, s.endedAt ?? now()); return { ...state, shouldIntervene: s.status === 'active' && state.shouldIntervene, sessionStatus: s.status }; },
    async intervene(id, body) {
      return change(id, s => {
        const message = text(body?.text, 'text', 2000);
        if (!['demo', 'gemini'].includes(body?.provider)) fail('provider must be demo or gemini.');
        const previous = s.interventions.at(-1);
        if (previous && now() - previous.timestamp < RULES.cooldownMs) fail('Intervention cooldown is active.', 429);
        s.interventions.push({ id: randomUUID(), timestamp: now(), text: message, provider: body.provider, state: deriveState(s, now()).state });
      });
    },
    end(id) { return change(id, s => { s.status = 'ended'; s.endedAt = now(); }); },
    async summary(id) { return summarize(await get(id), now()); },
  };
}
