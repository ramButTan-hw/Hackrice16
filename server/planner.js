import { randomUUID } from 'node:crypto';
import { fail, text, RULES } from '../shared/contracts.js';
import { usable } from './state-engine.js';

export function zoneClock(timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
    return timestamp => Object.fromEntries(formatter.formatToParts(timestamp).map(p => [p.type, p.value]));
  } catch { fail('Choose a valid time zone.'); }
}

// Time-weighted elevated-signal share, never a probability of feeling stressed.
// Require repeated observations on separate days before ranking a clock hour.
export function stressPatterns(sessions, timeZone = 'UTC') {
  const clock = zoneClock(timeZone);
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, observedSeconds: 0, elevatedSeconds: 0, sessions: new Set(), days: new Set() }));
  const real = sessions.filter(s => s.source === 'presage' && s.status === 'ended');
  for (const session of real) {
    session.samples.forEach((sample, index) => {
      if (!usable(sample) || ['heartRate', 'breathingRate'].some(key => (sample.qualityByMetric?.[key] ?? sample.quality) < RULES.quality) || sample.onBreak || !['steady', 'elevated'].includes(sample.state)) return;
      const end = Math.min(session.samples[index + 1]?.timestamp ?? session.endedAt, session.endedAt, sample.timestamp + RULES.staleMs);
      // Split at minute boundaries so clock-hour transitions and DST are respected.
      for (let at = sample.timestamp; at < end;) {
        const until = Math.min(end, (Math.floor(at / 60000) + 1) * 60000);
        const local = clock(at), bucket = hours[Number(local.hour)], seconds = (until - at) / 1000;
        bucket.observedSeconds += seconds;
        if (sample.state === 'elevated') bucket.elevatedSeconds += seconds;
        bucket.sessions.add(session.id); bucket.days.add(`${local.year}-${local.month}-${local.day}`);
        at = until;
      }
    });
  }
  return {
    timeZone, sessionCount: real.length, historyLimit: 100,
    explanation: 'Elevated-signal share is time with sustained heart and breathing elevation relative to each session baseline. It is not a stress diagnosis or a guarantee. Only completed real sessions count; breaks, missing signals and demo data are excluded.',
    hours: hours.map(h => {
      const ready = h.observedSeconds >= 600 && h.sessions.size >= 3 && h.days.size >= 3;
      return { hour: h.hour, observedSeconds: h.observedSeconds, sessionCount: h.sessions.size, dayCount: h.days.size,
        score: ready ? Math.round(100 * h.elevatedSeconds / h.observedSeconds) : null,
        confidence: ready ? (h.days.size >= 7 && h.observedSeconds >= 3600 ? 'higher' : 'limited') : 'insufficient' };
    }),
  };
}

export function suggestSlots(patterns, plans, { start, end, durationMinutes = 60 }, now = Date.now()) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start || end - start > 8 * 86400000) fail('Choose a search window of up to eight days.');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 240) fail('Duration must be 15–240 minutes.');
  const clock = zoneClock(patterns.timeZone), slots = [];
  const duration = durationMinutes * 60000, buffer = 15 * 60000;
  for (let at = Math.ceil(Math.max(start, now) / 1800000) * 1800000; at + duration <= end; at += 1800000) {
    if (plans.some(p => at < p.end + buffer && at + duration + buffer > p.start)) continue;
    const buckets = [];
    for (let t = at; t < at + duration; t += 60000) buckets.push(patterns.hours[Number(clock(t).hour)]);
    const known = buckets.every(b => b.score !== null);
    const score = known ? Math.round(buckets.reduce((sum, b) => sum + b.score, 0) / buckets.length) : null;
    slots.push({ start: at, end: at + duration, score, confidence: known ? (buckets.every(b => b.confidence === 'higher') ? 'higher' : 'limited') : 'insufficient',
      reason: known ? `${score}% historical elevated-signal time in these clock hours. Includes a 15-minute gap from saved plans.` : 'Not enough history for these hours. Available with a 15-minute gap from saved plans.' });
  }
  slots.sort((a, b) => (a.score ?? 101) - (b.score ?? 101) || a.start - b.start);
  // Return distinct alternatives rather than many overlapping versions of one block.
  const selected = [];
  for (const slot of slots) if (!selected.some(s => slot.start < s.end && slot.end > s.start)) { selected.push(slot); if (selected.length === 5) break; }
  return selected;
}

export function plannerService(repository, now = Date.now, calendar = null) {
  let queue = Promise.resolve();
  const exclusive = fn => { const next = queue.then(fn); queue = next.catch(() => {}); return next; };
  return {
    async patterns(timeZone) { return stressPatterns(await repository.list(), timeZone); },
    async list() { return repository.listPlans(); },
    async suggest(body) {
      const patterns = stressPatterns(await repository.list(), body.timeZone), plans = await repository.listPlans();
      // Validate bounds before making an external request.
      suggestSlots(patterns, plans, body, now());
      if (body.useGoogle) {
        if (!calendar) fail('Google Calendar is unavailable.', 503);
        plans.push(...await calendar.busy(body.start, body.end));
      }
      return suggestSlots(patterns, plans, body, now());
    },
    publish(id) { return exclusive(async () => {
      const plan = (await repository.listPlans()).find(p => p.id === id);
      if (!plan) fail('Plan not found.', 404);
      if (!calendar) fail('Google Calendar is unavailable.', 503);
      if (plan.end <= now()) fail('This plan has already ended.', 409);
      const google = await calendar.publish(plan);
      const updated = { ...plan, google };
      await repository.savePlan(updated); return updated;
    }); },
    create(body) { return exclusive(async () => {
      const title = text(body?.title, 'title');
      const { start, end, timeZone = 'UTC' } = body ?? {};
      zoneClock(timeZone);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < now() || end <= start || end - start > 86400000) fail('Choose a future plan lasting up to 24 hours.');
      const existing = await repository.listPlans();
      if (existing.some(p => start < p.end + 900000 && end + 900000 > p.start)) fail('This time is no longer available. Leave 15 minutes between plans and find times again.', 409);
      const plan = { id: randomUUID(), title, start, end, timeZone, createdAt: now() };
      await repository.insertPlan(plan); return plan;
    }); },
    remove(id) { return exclusive(async () => { await repository.deletePlan(id); return { ok: true }; }); },
  };
}
