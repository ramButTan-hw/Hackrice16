import express from 'express';
import { fileURLToPath } from 'node:url';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, node: process.versions.node });
  });
  app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url))));
  return app;
}
