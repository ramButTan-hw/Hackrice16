import { useEffect, useState } from 'react';

export default function EventLog({ sessionId, visible }) {
  const [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    if (!sessionId || !visible) return;
    let alive = true, pending = false;
    setData(null); setError('');
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(`/api/sessions/${sessionId}/events`);
        if (!response.ok) throw new Error('Could not load the session log. Restart the backend after updating.');
        const next = await response.json();
        if (alive) { setData(next); setError(''); }
      } catch (error) { if (alive) setError(error.message); }
      finally { pending = false; }
    }
    void refresh(); const timer = setInterval(refresh, 2000);
    return () => { alive = false; clearInterval(timer); };
  }, [sessionId, visible]);
  return <section hidden={!visible} className="event-log" aria-label="Pipeline log">
    <div className="camera-heading"><strong>Pipeline log</strong>{sessionId && <a href={`/api/sessions/${sessionId}/events?download=1`} download>Download JSON</a>}</div>
    <p>Presage packets, validation codes, local analysis results, Gemini requests and responses. Metric arrays show their latest two returned values and total count; no video is stored.</p>
    {error && <p role="alert">{error}</p>}
    {!sessionId ? <p>Start or open a session to view its log.</p> : !data?.events?.length ? <p>No events recorded yet. Resume monitoring after restarting the app.</p> : <>
      <small>Showing {data.events.length} of {data.totalEvents} events (latest {data.retainedLimit} retained).</small>
      <div className="event-list">{[...data.events].reverse().map(event => <details key={event.sequence}>
        <summary><time>{new Date(event.timestamp).toLocaleTimeString()}</time> <strong>{event.source}</strong> · {event.event}</summary>
        <pre>{JSON.stringify(event.data, null, 2)}</pre>
      </details>)}</div>
    </>}
  </section>;
}
