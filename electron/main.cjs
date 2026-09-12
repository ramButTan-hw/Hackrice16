const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const development = process.argv.includes('--dev');
let server;
let appUrl;

function createWindow() {
  const window = new BrowserWindow({
    width: 468,
    height: 490,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: 'Session',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== new URL(appUrl).origin) event.preventDefault();
  });
  window.loadURL(appUrl);
}

// Expose only window controls to the trusted top-level renderer.
function trustedWindow(event) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || event.senderFrame !== event.sender.mainFrame
    || new URL(event.senderFrame.url).origin !== new URL(appUrl).origin) throw new Error('Untrusted window');
  return window;
}
ipcMain.handle('window:compact', (event, compact) => {
  if (typeof compact !== 'boolean') throw new Error('Invalid window mode');
  const window = trustedWindow(event);
  const bounds = window.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(compact ? 368 : 468, area.width);
  const height = Math.min(compact ? 90 : 490, area.height);
  window.setBounds({ x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)), width, height });
  return compact;
});
ipcMain.handle('window:pinned', (event, pinned) => {
  if (typeof pinned !== 'boolean') throw new Error('Invalid pin state');
  trustedWindow(event).setAlwaysOnTop(pinned);
  return pinned;
});
ipcMain.on('window:minimize', event => trustedWindow(event).minimize());
ipcMain.on('window:close', event => trustedWindow(event).close());

app.whenReady().then(async () => {
  if (development) {
    appUrl = 'http://127.0.0.1:5173';
  } else {
    const { createApp } = await import('../server/app.js');
    await new Promise((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1', resolve);
      server.on('error', reject);
    });
    appUrl = 'http://127.0.0.1:' + server.address().port;
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => server?.close());
