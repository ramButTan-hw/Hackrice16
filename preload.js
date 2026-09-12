const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spectraBridge', {
  startSession: () => ipcRenderer.send('start-session'),
  stopSession: () => ipcRenderer.send('stop-session'),
  sendFrame: (frameData) => ipcRenderer.send('push-frame', frameData),
  onMetrics: (callback) => ipcRenderer.on('sdk-metrics', (_event, value) => callback(value)),
  onValidation: (callback) => ipcRenderer.on('sdk-validation', (_event, value) => callback(value)),
  onSessionState: (callback) => ipcRenderer.on('session-state', (_event, value) => callback(value))
});