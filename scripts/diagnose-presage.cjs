// Uses synthetic blank frames, never the camera. Only structured diagnostics
// and filtered, credential-redacted native errors leave the child process.
const { existsSync } = require('node:fs');
const { spawn } = require('node:child_process');
if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.argv.includes('--child')) {
  const child = spawn(process.execPath, [__filename, '--child'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const timeout = setTimeout(() => { child.kill(); console.log('Presage diagnostic timed out.'); }, 20000);
  child.on('error', () => console.log('Could not start Presage diagnostic.'));
  child.on('exit', code => {
    clearTimeout(timeout);
    for (const line of output.split(/\r?\n/)) if (line.startsWith('PRESAGE_DIAG ')) console.log(line.slice(13));
    let details = output.split(/\r?\n/).filter(line => !line.startsWith('PRESAGE_DIAG ') && /error|fail|not found|denied|unsupported|graph|calculator|GPU|OpenGL|INVALID_ARGUMENT/i.test(line)).join('\n');
    for (const [name, value] of Object.entries(process.env)) if (/KEY|TOKEN|SECRET/i.test(name) && value) details = details.split(value).join('[redacted]');
    if (details) console.log(details.slice(-7000));
    console.log(JSON.stringify({ diagnosticExitCode: code }));
  });
} else {
  const secrets = Object.entries(process.env).filter(([name, value]) => /KEY|TOKEN|SECRET/i.test(name) && value).map(([, value]) => value);
  const report = value => {
    let text = JSON.stringify(value);
    for (const secret of secrets) text = text.split(secret).join('[redacted]');
    console.log('PRESAGE_DIAG ' + text);
  };
  async function run() {
    if (!process.env.PRESAGE_API_KEY) { report({ error: 'PRESAGE_API_KEY is missing' }); return; }
    const { SmartSpectraSDK, SmartSpectraLogLevel, breathingMetrics, cardioMetrics, PixelFormat } = require('@smartspectra/node-sdk');
    const sdk = new SmartSpectraSDK({ apiKey: process.env.PRESAGE_API_KEY, requestedMetrics: [...breathingMetrics, ...cardioMetrics], logLevel: SmartSpectraLogLevel.kWarning });
    let failed = false;
    sdk.on('error', (code, message, retryable) => { failed = true; report({ code, message, retryable }); });
    sdk.on('processingStatus', status => report({ processingStatus: status }));
    try {
      sdk.useCustomInput(); sdk.start();
      const frame = Buffer.alloc(640 * 480 * 4);
      const began = Date.now();
      while (!failed && Date.now() - began < 5000) {
        sdk.sendFrame(frame, 640, 480, 640 * 4, PixelFormat.kRGBA, Date.now() * 1000);
        await new Promise(resolve => setTimeout(resolve, 34));
      }
      report({ startupErrorObserved: failed, syntheticFramesOnly: true });
    } catch (error) { report({ code: error.code, message: error.message, retryable: error.retryable }); }
    finally { try { await sdk.stopAsync(); } finally { await sdk.destroy(); } }
  }
  run().catch(error => { report({ message: error.message }); process.exitCode = 1; });
}
