const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('helpPanel',{
  openGoogle:url=>ipcRenderer.invoke('google:open',url),
  snapshot:()=>ipcRenderer.invoke('help:snapshot'),
  ready:()=>ipcRenderer.invoke('help:panel-ready'),
  action:action=>ipcRenderer.send('help:panel-action',action),
  subscribe:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('help:panel-state',listener);return()=>ipcRenderer.removeListener('help:panel-state',listener);}
});
