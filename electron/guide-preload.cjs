const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('guide',{
 transcribe:audio=>ipcRenderer.invoke('guide:transcribe',audio),
 voice:(text,epoch)=>ipcRenderer.invoke('guide:voice',text,epoch),
 microphone:()=>ipcRenderer.invoke('guide:microphone'),
 setGoal:goal=>ipcRenderer.invoke('guide:set-goal',goal),
 ready:()=>ipcRenderer.invoke('guide:ready'),
 next:goal=>ipcRenderer.invoke('guide:next',goal),
 takeover:()=>ipcRenderer.invoke('guide:takeover'),
 execute:()=>ipcRenderer.invoke('guide:execute'),
 enable:()=>ipcRenderer.invoke('guide:enable'),
 stop:()=>ipcRenderer.invoke('guide:stop'),
 subscribe:callback=>{const listener=(_e,state)=>callback(state);ipcRenderer.on('guide:state',listener);return()=>ipcRenderer.removeListener('guide:state',listener);}
});
