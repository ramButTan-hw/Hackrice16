import CompanionChat from './CompanionChat.jsx';
export default function Chat({visible,sessionId}){return <section className="chat" hidden={!visible}>{visible&&<CompanionChat sessionId={sessionId}/>}</section>;}
