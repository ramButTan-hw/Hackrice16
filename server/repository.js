import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fail } from '../shared/contracts.js';

// A session aggregate is committed atomically; revision prevents lost updates.
export function sqliteRepository(path = 'data/companion.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS session_records (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, started_at INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));');
  db.exec('CREATE TABLE IF NOT EXISTS planner_records (id TEXT PRIMARY KEY, start_at INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));');
  db.exec('CREATE TABLE IF NOT EXISTS widget_records (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));');
  return {
    kind: 'sqlite',
    async getWidget(id) { const row=db.prepare('SELECT payload FROM widget_records WHERE id=?').get(id); return row?JSON.parse(row.payload):null; },
    async saveWidget(value,revision) {
      const result=db.prepare('INSERT INTO widget_records VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload WHERE widget_records.revision=?').run(value.id,value.revision,JSON.stringify(value),revision);
      if(!result.changes)fail('Widget changed. Refresh and try again.',409);
    },
    async listPlans() { return db.prepare('SELECT payload FROM planner_records ORDER BY start_at').all().map(r => JSON.parse(r.payload)); },
    async insertPlan(p) { db.prepare('INSERT INTO planner_records VALUES (?, ?, ?)').run(p.id, p.start, JSON.stringify(p)); },
    async savePlan(p) { db.prepare('UPDATE planner_records SET payload=? WHERE id=?').run(JSON.stringify(p), p.id); },
    async deletePlan(id) { db.prepare('DELETE FROM planner_records WHERE id=?').run(id); },
    async get(id) { const row = db.prepare('SELECT payload FROM session_records WHERE id=?').get(id); return row ? JSON.parse(row.payload) : null; },
    async list() { return db.prepare('SELECT payload FROM session_records ORDER BY started_at DESC LIMIT 100').all().map(r => JSON.parse(r.payload)); },
    async insert(s) { db.prepare('INSERT INTO session_records VALUES (?, ?, ?, ?)').run(s.id, s.revision, s.startedAt, JSON.stringify(s)); },
    async save(s, revision) {
      const result = db.prepare('UPDATE session_records SET revision=?, payload=? WHERE id=? AND revision=?').run(s.revision, JSON.stringify(s), s.id, revision);
      if (!result.changes) fail('Session changed. Reload and retry.', 409);
    },
    close() { db.close(); },
  };
}

export function supabaseRepository(url, key, fetcher = fetch) {
  if (!url || !key || new URL(url).protocol !== 'https:') throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY for cloud storage.');
  const base = new URL('/rest/v1/session_records', url);
  async function request(query = '', method = 'GET', body, table = 'session_records') {
    const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
    // New secret keys use apikey only; legacy service-role JWTs also use Authorization.
    if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
    let response;
    try { response = await fetcher(new URL('/rest/v1/' + table, base) + query, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) }); }
    catch { fail('Database connection interrupted or timed out. Check your connection and try again.', 503); }
    if (!response.ok) fail(`Database request failed (${response.status}). Check server configuration and migration.`, 502);
    try { return await response.json(); }
    catch { fail('Database returned an incomplete response. Try again shortly.', 502); }
  }
  return {
    kind: 'supabase',
    async getWidget(id) { return (await request('?id=eq.'+encodeURIComponent(id)+'&select=payload','GET',undefined,'widget_records'))[0]?.payload??null; },
    async saveWidget(value,revision) {
      if(revision===0){await request('','POST',{id:value.id,revision:value.revision,payload:value},'widget_records');return;}
      const rows=await request('?id=eq.'+encodeURIComponent(value.id)+'&revision=eq.'+revision,'PATCH',{revision:value.revision,payload:value},'widget_records');
      if(!rows.length)fail('Widget changed. Refresh and try again.',409);
    },
    async listPlans() { return (await request('?select=payload&order=start_at.asc', 'GET', undefined, 'planner_records')).map(r => r.payload); },
    async insertPlan(p) { await request('', 'POST', { id: p.id, start_at: p.start, payload: p }, 'planner_records'); },
    async savePlan(p) { await request('?id=eq.' + encodeURIComponent(p.id), 'PATCH', { payload: p }, 'planner_records'); },
    async deletePlan(id) { await request('?id=eq.' + encodeURIComponent(id), 'DELETE', undefined, 'planner_records'); },
    async get(id) { return (await request(`?id=eq.${encodeURIComponent(id)}&select=payload`))[0]?.payload ?? null; },
    async list() { return (await request('?select=payload&order=started_at.desc&limit=100')).map(r => r.payload); },
    async insert(s) { await request('', 'POST', { id: s.id, revision: s.revision, started_at: s.startedAt, payload: s }); },
    async save(s, revision) {
      const rows = await request(`?id=eq.${encodeURIComponent(s.id)}&revision=eq.${revision}`, 'PATCH', { revision: s.revision, payload: s });
      if (!rows.length) fail('Session changed. Reload and retry.', 409);
    },
    close() {},
  };
}
