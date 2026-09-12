import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { sqliteRepository, supabaseRepository } from './repository.js';
if (existsSync('.env')) loadEnvFile('.env');
export function configuredRepository() {
  const provider = process.env.DATA_PROVIDER || 'sqlite';
  if (provider === 'supabase') return supabaseRepository(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
  if (provider !== 'sqlite') throw new Error('DATA_PROVIDER must be sqlite or supabase.');
  return sqliteRepository(process.env.DATABASE_PATH || 'data/companion.sqlite');
}
