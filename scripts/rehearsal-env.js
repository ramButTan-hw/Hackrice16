import {join} from 'node:path';

export function rehearsalEnvironment(env, folder) {
  const isolated = {...env, DATA_PROVIDER: 'sqlite', DATABASE_PATH: join(folder, 'rehearsal.sqlite'), JARVIS_REHEARSAL: '1'};
  for (const key of ['GEMINI_API_KEY', 'GEMINI_IMAGE_API_KEY', 'ELEVENLABS_API_KEY', 'PRESAGE_API_KEY',
    'BACKBOARD_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY']) isolated[key] = '';
  delete isolated.ELECTRON_RUN_AS_NODE;
  return isolated;
}
