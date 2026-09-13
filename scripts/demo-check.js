// Read-only source-launch preflight. Importing this module performs no checks or env loading.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

/** Pure report builder: inputs contain presence/status only; credentials are never returned. */
export function createDemoReport({ env = {}, files = {}, runtime = {} } = {}) {
  const checks = [];
  const add = (id, status, message) => checks.push({ id, status, message });
  const configured = key => typeof env[key] === 'string' && env[key].trim().length > 0;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(runtime.nodeVersion ?? ''));
  const nodeReady = match && (Number(match[1]) > 22 || (Number(match[1]) === 22 && Number(match[2]) >= 12));
  add('node', nodeReady ? 'pass' : 'fail', nodeReady ? 'Node meets the 22.12+ requirement.' : 'Install Node 22.12 or newer, then reinstall dependencies.');
  add('dependencies', files.dependencies ? 'pass' : 'fail', files.dependencies ? 'Core application dependency files are present.' : 'Core dependency files are missing. Run npm ci.');
  add('electron', files.electron ? 'pass' : 'fail', files.electron ? 'Electron executable is present; launch is not verified.' : 'Electron executable is missing. Run npm ci.');
  add('build', files.build ? 'pass' : 'fail', files.build ? 'Frontend build files are present; freshness is not verified. Run npm run build after edits.' : 'Frontend build is missing or incomplete. Run npm run build.');
  if (runtime.envLoadFailed) add('configuration', 'warn', 'Local configuration could not be read. Check its format before launching; no configuration values were printed.');

  const storage = env.DATA_PROVIDER || 'sqlite';
  const storageReady = storage === 'sqlite' || (storage === 'supabase' && configured('SUPABASE_URL') && configured('SUPABASE_SECRET_KEY'));
  add('storage', storageReady ? 'pass' : 'fail', storageReady
    ? storage === 'sqlite' ? 'SQLite selected; database contents and write access are not checked.' : 'Supabase settings are present; connection and migrations are not verified.'
    : 'Storage settings are incomplete or unsupported. Select sqlite, or configure both Supabase settings.');

  for (const [id, key, name, fallback] of [
    ['gemini', 'GEMINI_API_KEY', 'Gemini', 'AI chat and screen guidance need this key. Use local timers, checklists, and planner while unavailable.'],
    ['speech', 'ELEVENLABS_API_KEY', 'ElevenLabs', 'Use typed requests instead of spoken requests.'],
    ['presage', 'PRESAGE_API_KEY', 'Presage', 'Use the explicitly labeled simulated scenario; do not present simulated readings as live measurements.'],
    ['memory', 'BACKBOARD_API_KEY', 'Backboard', 'Cross-session AI memory is unavailable; local session history remains separate.'],
    ['google', 'GOOGLE_CLIENT_ID', 'Google OAuth client', 'Use local planner/checklist output until Google is configured and connected.'],
  ]) {
    const ready = configured(key);
    add(id, ready ? 'pass' : 'warn', ready ? `${name}: configured, NOT live verified.` : `${name}: not configured. ${fallback}`);
  }
  if (configured('GOOGLE_CLIENT_ID') && !configured('GOOGLE_CLIENT_SECRET')) add('google-secret', 'warn', 'Google client secret is absent. Check the Desktop OAuth client configuration before testing sign-in.');

  add('wake-python', files.wakePython ? 'pass' : 'warn', files.wakePython ? 'Wake Python executable is present; package imports and microphone detection are not verified.' : 'Wake Python is missing. Run the wake setup with Python 3.10–3.12, or use Listen / typed input.');
  add('wake-model', files.wakeModel ? 'pass' : 'warn', files.wakeModel ? 'Hey Jarvis ONNX model is present; inference is not verified.' : 'Hey Jarvis model was not found in the selected environment. Run wake setup or verify a custom Python environment manually; Listen / typed input remains available.');
  add('attention', files.attention ? 'pass' : 'warn', files.attention ? 'Local attention model and runtime files are present; camera tracking is not verified.' : 'Local attention assets are incomplete. Run npm run setup:attention and rebuild, or leave attention checks off.');
  if (runtime.platform === 'darwin') {
    add('mac-arch', runtime.arch === 'arm64' ? 'pass' : 'fail', runtime.arch === 'arm64' ? 'Node uses Apple Silicon ARM64.' : 'The current macOS launcher requires ARM64 Node on Apple Silicon. Disable Rosetta and reinstall dependencies.');
    add('electron-arch', runtime.electronArm64 === true ? 'pass' : runtime.electronArm64 === false ? 'fail' : 'warn', runtime.electronArm64 === true ? 'Electron binary includes ARM64.' : runtime.electronArm64 === false ? 'Electron is not ARM64. Reinstall native dependencies before launching on this Mac.' : 'Electron architecture could not be checked. Run npm run check:macos before rehearsal.');
    add('swift', runtime.swiftAvailable ? 'pass' : 'warn', runtime.swiftAvailable ? 'Swift compiler is available; the guide helper is not compiled by this check.' : 'Swift compiler is unavailable. Install Apple Command Line Tools for guide input, or use manual guidance.');
  } else add('guide-platform', 'warn', 'Supervised guide input currently requires macOS. Rehearse manual guidance on this platform.');
  add('git', Number.isInteger(runtime.dirtyCount) && runtime.dirtyCount >= 0 ? runtime.dirtyCount ? 'warn' : 'pass' : 'warn', Number.isInteger(runtime.dirtyCount) && runtime.dirtyCount >= 0
    ? `${runtime.dirtyCount} changed Git entries. Keep the rehearsed version fixed before presenting.`
    : 'Git status could not be checked. Preserve a known rehearsed version before presenting.');

  add('permissions', 'manual', 'In the actual Jarvis/Electron app, verify camera, microphone, and screen permissions. For takeover, verify Accessibility and perform a harmless click, then test Stop / Escape. This check never requests permissions.');
  add('google-live', 'manual', 'After the final app restart, verify Google shows Connected. Test the exact Docs or Calendar workflow on a disposable item; key presence does not prove OAuth consent or API access.');
  add('ai-voice-live', 'manual', 'Send one real AI request, then one spoken request and confirm the recognized text and resulting action. Test the wake phrase in room noise; keep Listen and typed input ready.');
  add('rehearsal', 'manual', 'Rehearse the same two-minute demo from a fresh launch, including saving and reopening its result. Clearly label simulated readings and recorded fallbacks.');
  return { checks, exitCode: checks.some(check => check.status === 'fail') ? 1 : 0 };
}

const list = path => { try { return readdirSync(path); } catch { return []; } };
const read = path => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };
const command = (name, args, cwd) => spawnSync(name, args, { cwd, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

function collectInputs(root, env) {
  const electronRelative = read(join(root, 'node_modules/electron/path.txt')).trim();
  const electronPath = electronRelative ? join(root, 'node_modules/electron/dist', electronRelative) : '';
  const wakePython = env.WAKE_PYTHON || join(root, 'data/wake-env', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const wakeRoot = resolve(dirname(wakePython), '..');
  const packages = [join(wakeRoot, 'Lib/site-packages'), ...list(join(wakeRoot, 'lib')).filter(name => /^python\d+\.\d+$/.test(name)).map(name => join(wakeRoot, 'lib', name, 'site-packages'))];
  const wakeModel = packages.some(path => list(join(path, 'openwakeword/resources/models')).some(name => /^hey_jarvis(?:_[\w.]+)?\.onnx$/.test(name)));
  const attentionRoot = join(root, 'public/attention-runtime');
  const assets = list(join(root, 'dist/assets'));
  const git = command('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '-z', '--untracked-files=normal', '--no-renames'], root);
  const swift = process.platform === 'darwin' ? command('/usr/bin/xcrun', ['--find', 'swiftc'], root) : null;
  const binary = process.platform === 'darwin' && existsSync(electronPath) ? command('/usr/bin/file', [electronPath], root) : null;
  return {
    env,
    files: {
      dependencies: ['react', 'react-dom', 'express', 'vite', 'electron'].every(name => existsSync(join(root, 'node_modules', name, 'package.json'))),
      electron: Boolean(electronPath) && existsSync(electronPath),
      build: existsSync(join(root, 'dist/index.html')) && assets.some(name => name.endsWith('.js')) && assets.some(name => name.endsWith('.css')),
      wakePython: existsSync(wakePython), wakeModel,
      attention: ['vision_bundle.js', 'face.task', 'objects.tflite', 'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_internal.wasm', 'wasm/vision_wasm_nosimd_internal.js', 'wasm/vision_wasm_nosimd_internal.wasm'].every(name => existsSync(join(attentionRoot, name))),
    },
    runtime: {
      nodeVersion: process.versions.node, platform: process.platform, arch: process.arch,
      dirtyCount: git.status === 0 ? git.stdout.split('\0').filter(Boolean).length : null,
      swiftAvailable: swift?.status === 0,
      electronArm64: binary?.status === 0 ? /\barm64\b/.test(binary.stdout) : null,
    },
  };
}

export function formatDemoReport(report) {
  return ['Jarvis demo preflight — local presence checks only; providers and hardware are NOT live verified.',
    ...report.checks.map(check => `[${check.status.toUpperCase()}] ${check.message}`),
    report.exitCode ? 'Resolve the core failures before launching the demo.' : 'Core local prerequisites passed. Complete the manual checks before presenting.',
  ].join('\n');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let envLoadFailed = false;
  try { if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env')); } catch { envLoadFailed = true; }
  try {
    const inputs = collectInputs(root, process.env);
    inputs.runtime.envLoadFailed = envLoadFailed;
    const report = createDemoReport(inputs);
    console.log(formatDemoReport(report));
    process.exitCode = report.exitCode;
  } catch {
    console.error('Demo preflight could not complete its local checks. No configuration values were printed. Verify dependencies and run again.');
    process.exitCode = 1;
  }
}
