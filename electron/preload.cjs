const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('companionWindow', {
  setCompact: value => ipcRenderer.invoke('window:compact', value),
  setPinned: value => ipcRenderer.invoke('window:pinned', value),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
});
