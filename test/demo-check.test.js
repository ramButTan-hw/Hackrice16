import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createDemoReport, formatDemoReport } from '../scripts/demo-check.js';

const ready = () => ({
  env: {},
  files: { dependencies: true, electron: true, build: true, wakePython: true, wakeModel: true, attention: true },
  runtime: { nodeVersion: '22.12.0', platform: 'darwin', arch: 'arm64', electronArm64: true, swiftAvailable: true, dirtyCount: 0 },
});
const check = (report, id) => report.checks.find(item => item.id === id);

test('missing optional integrations preserve a passing core with explicit fallbacks and manual checks', () => {
  const report = createDemoReport(ready());
  assert.equal(report.exitCode, 0);
  assert.equal(check(report, 'speech').status, 'warn');
  assert.match(check(report, 'speech').message, /typed/);
  assert.equal(check(report, 'google-live').status, 'manual');
  assert.equal(check(report, 'permissions').status, 'manual');
  assert.equal(check(report, 'ai-voice-live').status, 'manual');
});

test('hard launch prerequisites fail without mistaking optional assets for blockers', () => {
  for (const key of ['dependencies', 'electron', 'build']) {
    const input = ready(); input.files[key] = false;
    assert.equal(createDemoReport(input).exitCode, 1, key);
  }
  for (const key of ['wakePython', 'wakeModel', 'attention']) {
    const input = ready(); input.files[key] = false;
    assert.equal(createDemoReport(input).exitCode, 0, key);
  }
  for (const version of ['20.19.0', '22.11.9', '', 'not-a-version']) {
    const input = ready(); input.runtime.nodeVersion = version;
    assert.equal(check(createDemoReport(input), 'node').status, 'fail');
  }
  for (const version of ['22.12.0', '24.1.0']) {
    const input = ready(); input.runtime.nodeVersion = version;
    assert.equal(check(createDemoReport(input), 'node').status, 'pass');
  }
});

test('report never emits credential values, custom paths or unrecognized config values', () => {
  const secret = 'private-secret-value';
  const input = ready();
  input.env = Object.fromEntries(['GEMINI_API_KEY', 'ELEVENLABS_API_KEY', 'PRESAGE_API_KEY', 'BACKBOARD_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'WAKE_PYTHON', 'DATABASE_PATH'].map(key => [key, secret]));
  input.env.DATA_PROVIDER = secret;
  const report = createDemoReport(input);
  assert.equal(report.exitCode, 1);
  assert.equal(JSON.stringify(report).includes(secret), false);
  assert.equal(formatDemoReport(report).includes(secret), false);
  for (const key of ['gemini', 'speech', 'presage', 'memory', 'google']) assert.match(check(report, key).message, /configured, NOT live verified/);
});

test('storage config is checked without connecting or rejecting default SQLite', () => {
  const input = ready(); input.env.DATA_PROVIDER = 'supabase';
  assert.equal(check(createDemoReport(input), 'storage').status, 'fail');
  input.env.SUPABASE_URL = 'https://example.invalid'; input.env.SUPABASE_SECRET_KEY = 'secret';
  const report = createDemoReport(input);
  assert.equal(report.exitCode, 0);
  assert.match(check(report, 'storage').message, /not verified/);
});

test('macOS launcher architecture failures block; missing compiler and dirty Git only warn', () => {
  const input = ready(); input.runtime.arch = 'x64';
  assert.equal(check(createDemoReport(input), 'mac-arch').status, 'fail');
  input.runtime.arch = 'arm64'; input.runtime.electronArm64 = false;
  assert.equal(createDemoReport(input).exitCode, 1);
  input.runtime.electronArm64 = true; input.runtime.swiftAvailable = false; input.runtime.dirtyCount = 5;
  const report = createDemoReport(input);
  assert.equal(report.exitCode, 0);
  assert.equal(check(report, 'swift').status, 'warn');
  assert.match(check(report, 'git').message, /^5 changed Git entries/);
  input.runtime.platform = 'win32';
  assert.equal(check(createDemoReport(input), 'guide-platform').status, 'warn');
  assert.equal(check(createDemoReport(input), 'mac-arch'), undefined);
});

test('empty credentials and failed env reading remain visible without exposing errors', () => {
  const input = ready(); input.env.GEMINI_API_KEY = '  '; input.runtime.envLoadFailed = true;
  const report = createDemoReport(input);
  assert.equal(check(report, 'gemini').status, 'warn');
  assert.equal(check(report, 'configuration').status, 'warn');
  assert.equal(report.exitCode, 0);
});

test('importing the report module does not load configuration or print a report', () => {
  const moduleUrl = new URL('../scripts/demo-check.js', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `const before = JSON.stringify(process.env); await import(${JSON.stringify(moduleUrl)}); if (JSON.stringify(process.env) !== before) throw new Error('Import changed the environment');`], { encoding: 'utf8', env: {}, timeout: 5000 });
  assert.equal(child.status, 0);
  assert.equal(child.stdout, '');
  assert.equal(child.stderr, '');
});
