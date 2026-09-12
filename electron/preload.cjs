const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('helpBridge',{
  openGoogle:url=>ipcRenderer.invoke('google:open',url),
  snapshot:()=>ipcRenderer.invoke('help:snapshot'),
  status:()=>ipcRenderer.invoke('help:status'),
  panel:state=>ipcRenderer.invoke('help:panel',state),
  session:id=>ipcRenderer.invoke('help:session',id),
  wakeStart:()=>ipcRenderer.invoke('help:wake-start'),wakeStop:()=>ipcRenderer.invoke('help:wake-stop'),
  wakeAudio:data=>ipcRenderer.invoke('help:wake-audio',data),
  liveStart:context=>ipcRenderer.invoke('help:live-start',context),liveStop:()=>ipcRenderer.invoke('help:live-stop'),
  send:(kind,data)=>ipcRenderer.invoke('help:send',kind,data),screen:()=>ipcRenderer.invoke('help:screen'),reveal:()=>ipcRenderer.invoke('help:reveal'),
  subscribe:callback=>{const listener=(_e,data)=>callback(data);ipcRenderer.on('help:event',listener);return()=>ipcRenderer.removeListener('help:event',listener);},
});
contextBridge.exposeInMainWorld('companionWindow', {
  appearance:()=>ipcRenderer.invoke('window:appearance'),
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
