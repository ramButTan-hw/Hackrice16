import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {rehearsalEnvironment} from './rehearsal-env.js';

const folder = mkdtempSync(join(tmpdir(), 'jarvis-rehearsal-'));
const electron = createRequire(import.meta.url)('electron');
console.log('Opening an isolated offline rehearsal. Signals and the check-in are simulated.');
console.log('Camera, microphone, cloud AI and Google are off. Your normal database is unchanged.');
console.log('Temporary rehearsal files: ' + folder);
const child = spawn(electron, ['.', '--rehearsal', '--user-data-dir=' + join(folder, 'profile')], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), env: rehearsalEnvironment(process.env, folder), stdio: 'inherit',
});
child.once('error', error => {console.error('Could not start rehearsal: ' + error.message); process.exitCode = 1;});
child.once('exit', code => {process.exitCode = code ?? 1;});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
