import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fail } from '../shared/contracts.js';

// A session aggregate is committed atomically; revision prevents lost updates.
export function sqliteRepository(path = 'data/companion.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS session_records (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, started_at INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));');
  return {
    kind: 'sqlite',
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
  async function request(query = '', method = 'GET', body) {
    const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
    // New secret keys use apikey only; legacy service-role JWTs also use Authorization.
    if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
    const response = await fetcher(base + query, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
    if (!response.ok) fail(`Database request failed (${response.status}). Check server configuration and migration.`, 502);
    return response.json();
  }
  return {
    kind: 'supabase',
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
