import { useEffect, useRef, useState } from 'react';

export default function Chat({ visible, sessionId }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [share, setShare] = useState(true);
  const [speak, setSpeak] = useState(false);
  const inFlight = useRef(false);
  const log = useRef(null);
  useEffect(() => { if (visible && log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, visible, busy]);
  async function send(event) {
    event.preventDefault();
    if (inFlight.current || !draft.trim()) return;
    inFlight.current = true; setBusy(true); setError('');
    const question = { role: 'user', text: draft.trim() };
    const context = [...messages.slice(-6).map(m => ({ role: m.role, text: m.text.slice(0, 2000) })), question];
    while (context.reduce((sum, m) => sum + m.text.length, 0) > 6000 && context.length > 1) context.splice(0, 2);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: context, sessionId: share ? sessionId : undefined, speak }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to send message.');
      setMessages(previous => [...previous, question, { role: 'model', text: data.text, audio: data.audio }]); setDraft('');
      if (data.audioError) setError(data.audioError);
    } catch (error) { setError(error.message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="chat" hidden={!visible} aria-label="Gemini chat">
    <div className="chat-heading"><span>Gemini</span><button type="button" disabled={busy || !messages.length} onClick={() => { setMessages([]); setError(''); }}>Clear chat</button></div>
    <div className="chat-log" ref={log} role="log" aria-live="polite" aria-relevant="additions">
      {!messages.length && <p className="chat-empty">Ask a question or get help with your task.</p>}
      {messages.map((message, index) => <div className={'chat-message ' + message.role} key={index}><span>{message.role === 'user' ? 'You' : 'Gemini'}</span><p>{message.text}</p>{message.audio && <audio controls src={message.audio} aria-label="Listen to reply" style={{ width: '100%' }}/>}</div>)}
      {busy && <p className="chat-pending">Replying…</p>}
    </div>
    {error && <p className="chat-error" role="alert">{error}</p>}
    <form onSubmit={send} className="chat-form">
      <label><input type="checkbox" checked={speak} disabled={busy} onChange={event => setSpeak(event.target.checked)}/> Voice reply</label>
      <label className="visually-hidden" htmlFor="chat-message">Message Gemini</label>
      <textarea id="chat-message" placeholder="Message Gemini…" rows="2" maxLength={2000} value={draft} disabled={busy} onChange={event => setDraft(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form.requestSubmit(); }
      }}/>
      <div className="chat-controls"><label><input type="checkbox" checked={share} disabled={!sessionId || busy} onChange={event => setShare(event.target.checked)}/> Include session</label><button type="submit" disabled={busy || !draft.trim()}>Send</button></div>
    </form>
  </section>;
}
