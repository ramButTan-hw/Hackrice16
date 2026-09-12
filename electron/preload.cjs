const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('companionWindow', {
  setCompact: value => ipcRenderer.invoke('window:compact', value),
  setPinned: value => ipcRenderer.invoke('window:pinned', value),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
});
contextBridge.exposeInMainWorld('presage', {
  status: () => ipcRenderer.invoke('presage:status'),
  start: () => ipcRenderer.invoke('presage:start'),
  stop: () => ipcRenderer.invoke('presage:stop'),
  frame: data => ipcRenderer.invoke('presage:frame', data),
  idle: () => ipcRenderer.invoke('presage:idle'),
  subscribe: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('presage:event', listener);
    return () => ipcRenderer.removeListener('presage:event', listener);
  },
});
