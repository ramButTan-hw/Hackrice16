require('dotenv').config();
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { 
  SmartSpectraSDK, 
  PixelFormat, 
  breathingMetrics, 
  faceMetrics, 
  decodeMetrics 
} = require('@smartspectra/node-sdk');
let mainWindow;
let sdk = null;
let isSessionActive = false;
let startTimeUs = null;
let lastTimestampUs = -1;



function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  const sdkDir = path.dirname(require.resolve('@smartspectra/node-sdk'));
  console.log('SDK directory path:', sdkDir);
  createWindow();

  // Instantiate SDK wrapper without starting the pipeline yet
  sdk = new SmartSpectraSDK({
    apiKey: process.env.PRESAGE_API_KEY,
    requestedMetrics: [...breathingMetrics, ...(faceMetrics || ['face', 'facialExpression'])],
  });

  sdk.on('validationStatus', (code, ts, hint) => {
    if (mainWindow) mainWindow.webContents.send('sdk-validation', { code, hint });
  });

  sdk.on('metrics', (buf, ts) => {
    const decoded = decodeMetrics(buf);
    if (mainWindow) mainWindow.webContents.send('sdk-metrics', decoded);
  });

  sdk.on('error', (code, message, retryable) => {
    console.error('SmartSpectra error:', code, message);
  });
});

// Start an on-demand session
ipcMain.on('start-session', () => {
  console.log('[Main] Received start-session IPC');
  if (!sdk) {
    console.error('[Main] sdk instance is null!');
    return;
  }

  if (!sdk || isSessionActive) return;

  try {
    startTimeUs = null;
    lastTimestampUs = -1;
    
    sdk.useCustomInput();
    sdk.start();
    isSessionActive = true;
    
    console.log('SmartSpectra reading session started.');
    if (mainWindow) mainWindow.webContents.send('session-state', { active: true });
  } catch (err) {
    console.error('Failed to start reading session:', err);
  }
});

// Stop session and tear down active rPPG pipeline
ipcMain.on('stop-session', async () => {
  if (!sdk || !isSessionActive) return;

  isSessionActive = false;
  try {
    if (sdk.stopAsync) {
      await sdk.stopAsync();
    }
    console.log('SmartSpectra reading session stopped.');
  } catch (err) {
    console.error('Failed to cleanly stop reading session:', err);
  } finally {
    if (mainWindow) mainWindow.webContents.send('session-state', { active: false });
  }
});

// Only process and push frames while a reading is explicitly running
ipcMain.on('push-frame', (event, { data, width, height }) => {
  if (!sdk || !isSessionActive) return;

  const nowUs = Math.floor(Date.now() * 1000);
  if (startTimeUs === null) startTimeUs = nowUs;

  let ts = nowUs - startTimeUs;
  if (ts <= lastTimestampUs) {
    ts = lastTimestampUs + 33333; // ~30 fps progression step
  }
  lastTimestampUs = ts;

  const w = Math.floor(width);
  const h = Math.floor(height);
  const strideBytes = w * 4;

  try {
    sdk.sendFrame(
      Buffer.from(data),
      w,
      h,
      strideBytes,
      PixelFormat.RGBA,
      ts
    );
  } catch (err) {
    console.error('Error sending frame to SmartSpectra:', err);
  }
});

app.on('window-all-closed', async () => {
  if (sdk) {
    if (isSessionActive && sdk.stopAsync) await sdk.stopAsync();
    await sdk.destroy();
  }
  if (process.platform !== 'darwin') app.quit();
});