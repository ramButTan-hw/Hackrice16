import { createApp } from './app.js';

const port = Number(process.env.PORT || 3001);
const app = createApp();
const server = app.listen(port, '127.0.0.1', () => {
  console.log('Node API: http://127.0.0.1:' + port);
});
server.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => { await app.locals.close(); server.close(() => process.exit(0)); });
}
