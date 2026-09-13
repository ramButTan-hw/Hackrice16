import {useEffect,useState} from 'react';
import CompanionChat from './CompanionChat.jsx';
export default function Chat({visible,sessionId}){
  const [opened,setOpened]=useState(visible);
  useEffect(()=>{if(visible)setOpened(true);},[visible]);
  return <section className="chat" hidden={!visible}>{(visible||opened)&&<CompanionChat sessionId={sessionId} visible={visible}/>}</section>;
}
