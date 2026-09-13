const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('plannerWindow', {
  appearance: () => ipcRenderer.invoke('window:appearance'),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  openGoogle: url => ipcRenderer.invoke('google:open', url),
});
