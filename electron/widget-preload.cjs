const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('widgetWindow',{
  close:()=>ipcRenderer.send('window:close'),
  minimize:()=>ipcRenderer.send('window:minimize'),
  appearance:()=>ipcRenderer.invoke('window:appearance'),
  pinned:value=>ipcRenderer.invoke('window:pinned',value),
});
