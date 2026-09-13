import test from 'node:test';
import assert from 'node:assert/strict';
import { plannerCalendar } from '../server/planner-calendar.js';
import { plannerService } from '../server/planner.js';
import { sqliteRepository } from '../server/repository.js';
const start = Date.parse('2026-09-15T09:00:00Z');
const plan = { id: '12345678-1234-1234-1234-123456789abc', title: 'Read notes', start, end: start + 3600000, timeZone: 'UTC' };
function fixture(overrides = {}) {
  const calls = []; let saved = null;
  const auth = { status: () => ({ connected: true, accountId: 'owner' }), request: async (url, method, body, owner) => {
    calls.push({ url, method, body, owner });
    if (url.endsWith('/freeBusy')) return { calendars: { primary: { busy: [] }, jarvis: { busy: [] } } };
    if (method === 'GET') { if (saved) return saved; throw Object.assign(new Error('not found'), { googleStatus: 404 }); }
    saved = { ...body, htmlLink: 'https://calendar.google.com/calendar/event' }; return saved;
  }, ...overrides };
  return { calls, auth, calendar: plannerCalendar({ auth, workspace: { plannerCalendarId: async () => 'jarvis' } }) };
}
test('availability uses primary and Jarvis calendars with boundary buffers', async () => {
  const f = fixture(); assert.deepEqual(await f.calendar.busy(start, plan.end), []);
  assert.deepEqual(f.calls[0].body.items, [{ id: 'primary' }, { id: 'jarvis' }]);
  assert.equal(Date.parse(f.calls[0].body.timeMin), start - 900000);
  assert.equal(Date.parse(f.calls[0].body.timeMax), plan.end + 900000);
});
test('missing calendar and Google per-calendar errors fail closed', async () => {
  for (const result of [{ calendars: {} }, { calendars: { primary: { errors: [{ reason: 'forbidden' }] } } }]) {
    const f = fixture({ request: async () => result });
    await assert.rejects(f.calendar.busy(start, plan.end), { status: 502 });
  }
});
test('publishing is idempotent and sends only calendar fields, no biometrics', async () => {
  const f = fixture();
  const first = await f.calendar.publish({ ...plan, stressScore: 80, samples: ['private'] });
  const second = await f.calendar.publish({ ...plan, google: first });
  assert.equal(first.eventId, second.eventId);
  const creates = f.calls.filter(c => c.method === 'POST' && !c.url.endsWith('/freeBusy'));
  assert.equal(creates.length, 1);
  assert.equal(creates[0].body.summary, plan.title);
  assert.ok(!JSON.stringify(creates[0].body).includes('private"]'));
  assert.equal(creates[0].body.stressScore, undefined);
  assert.equal(creates[0].body.samples, undefined);
});
test('publish blocks busy times and prevents account mismatch', async () => {
  const f = fixture({ request: async url => {
    if (!url.endsWith('/freeBusy')) throw Object.assign(new Error('not found'), { googleStatus: 404 });
    return { calendars: { primary: { busy: [{ start: new Date(start).toISOString(), end: new Date(plan.end).toISOString() }] }, jarvis: { busy: [] } } };
  } });
  await assert.rejects(f.calendar.publish(plan), { status: 409 });
  await assert.rejects(f.calendar.publish({ ...plan, google: { accountId: 'someone-else' } }), { status: 409 });
});
test('non-404 event lookup errors never create a new event', async () => {
  let writes = 0;
  const f = fixture({ request: async (_url, method) => { if (method === 'POST') writes++; throw Object.assign(new Error('offline'), { googleStatus: 500 }); } });
  await assert.rejects(f.calendar.publish(plan), /offline/); assert.equal(writes, 0);
});
test('planner merges Google busy intervals and persists publication metadata', async t => {
  const repo = sqliteRepository(':memory:'); t.after(() => repo.close());
  let calls = 0;
  const service = plannerService(repo, () => start, {
    busy: async () => { calls++; return [{ start, end: start + 3600000 }]; },
    publish: async () => ({ accountId: 'owner', eventId: 'event', url: 'https://calendar.google.com/calendar/event' }),
  });
  const slots = await service.suggest({ start, end: start + 3 * 3600000, timeZone: 'UTC', useGoogle: true });
  assert.equal(calls, 1); assert.ok(slots.every(s => s.start >= start + 4500000));
  const saved = await service.create({ ...plan, start: start + 7200000, end: start + 10800000 });
  const synced = await service.publish(saved.id);
  assert.equal(synced.google.eventId, 'event');
  assert.equal((await repo.listPlans())[0].google.eventId, 'event');
});
test('invalid search windows never query Google', async t => {
  const repo = sqliteRepository(':memory:'); t.after(() => repo.close());
  let calls = 0;
  const service = plannerService(repo, () => start, { busy: async () => { calls++; return []; } });
  await assert.rejects(service.suggest({ start, end: start - 1, useGoogle: true }), { status: 400 });
  assert.equal(calls, 0);
});
