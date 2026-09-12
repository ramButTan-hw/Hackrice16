import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, readFile, rename, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export function matlabWorker({ executable = process.env.MATLAB_EXECUTABLE || 'C:/Program Files/MATLAB/R2026a/bin/matlab.exe', root = resolve('data/matlab') } = {}) {
  let child, folder, boot, failure, closed = false;
  async function waitFile(path, timeout) {
    const deadline = Date.now() + timeout;
    while (!existsSync(path)) {
      if (closed || failure) throw new Error(failure || 'MATLAB stopped.');
      if (Date.now() > deadline) throw new Error('MATLAB timed out. Check its installation and license.');
      await delay(100);
    }
  }
  async function start() {
    if (closed) throw new Error('MATLAB worker is closed.');
    if (!boot) boot = (async () => {
      if (!existsSync(executable)) throw new Error('Set MATLAB_EXECUTABLE to your licensed MATLAB executable.');
      await mkdir(root, { recursive: true });
      folder = await mkdtemp(join(root, 'worker-'));
      const quote = value => value.replaceAll("'", "''");
      const analytics = fileURLToPath(new URL('../analytics', import.meta.url));
      if (closed) throw new Error('MATLAB worker is closed.');
      child = spawn(executable, ['-batch', `addpath('${quote(analytics)}'); monitorWorker('${quote(folder)}')`], { windowsHide: true, stdio: 'ignore' });
      child.on('error', () => { failure = 'MATLAB could not start. Check its executable and license.'; });
      child.on('exit', () => { failure = 'MATLAB stopped. Restart the backend to reconnect.'; });
      await waitFile(join(folder, 'ready'), 90000);
    })();
    return boot;
  }
  return {
    start,
    async analyze(session, now) {
      await start();
      const id = randomUUID();
      const input = join(folder, id + '.request.json');
      const output = join(folder, id + '.response.json');
      await writeFile(input + '.tmp', JSON.stringify({ session: { samples: session.samples }, now }));
      await rename(input + '.tmp', input);
      await waitFile(output, 15000);
      const report = JSON.parse(await readFile(output, 'utf8'));
      await unlink(output);
      if (report.error) throw new Error(report.error);
      if (report.provider !== 'matlab' || report.timestamp !== now || typeof report.ready !== 'boolean') throw new Error('Invalid MATLAB report.');
      return report;
    },
    async close() {
      if (closed) return;
      closed = true;
      if (folder) await writeFile(join(folder, 'stop'), '').catch(() => {});
      if (child && child.exitCode === null) {
        await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(2000)]);
        if (child.exitCode === null) child.kill();
      }
    },
  };
}
