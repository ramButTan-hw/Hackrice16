const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('helpPanel',{
  planner:()=>ipcRenderer.invoke('window:planner'),
  openWebsite:url=>ipcRenderer.invoke('browser:open',url),
  openGoogle:url=>ipcRenderer.invoke('google:open',url),
  snapshot:()=>ipcRenderer.invoke('help:snapshot'),
  ready:()=>ipcRenderer.invoke('help:panel-ready'),
  action:action=>ipcRenderer.send('help:panel-action',action),
  subscribe:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('help:panel-state',listener);return()=>ipcRenderer.removeListener('help:panel-state',listener);}
});

contextBridge.exposeInMainWorld('devicePermissions',{status:()=>ipcRenderer.invoke('permissions:status'),ensure:kind=>ipcRenderer.invoke('permissions:ensure',kind)});
