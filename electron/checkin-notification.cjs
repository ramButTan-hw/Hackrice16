exports.createCheckinNotifier = function ({Notification, beep, reveal, flash, report=()=>{}}) {
  const seen=new Set();
  let current=null;
  return {
    reset(){seen.clear();current?.close();current=null;},
    notify(checkin){
      if(!checkin||typeof checkin.id!=='string'||checkin.id.length>80||typeof checkin.text!=='string'||checkin.text.length>2000)throw new Error('Invalid check-in notification.');
      if(seen.has(checkin.id))return false;
      seen.add(checkin.id);
      if(seen.size>200)seen.delete(seen.values().next().value);
      // A local sound and taskbar cue also work when OS toasts are suppressed.
      try{beep();}catch{}
      try{flash();}catch{}
      try{
        current?.close();current=null;
        if(Notification.isSupported()){
          const notification=new Notification({title:'Jarvis check-in',body:checkin.text,silent:true});
          current=notification;
          notification.on('click',()=>{if(current===notification)reveal();});
          notification.on('failed',()=>report('Desktop notification unavailable; the check-in panel and local sound are still available.'));
          notification.show();
        }
      }catch{report('Desktop notification unavailable; the check-in panel and local sound are still available.');}
      return true;
    },
  };
};
