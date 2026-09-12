import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const [status, setStatus] = useState('Connecting to Node.js...');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('API unavailable');
        return response.json();
      })
      .then((data) => setStatus('Node.js ' + data.node + ' is connected'))
      .catch((error) => {
        if (error.name !== 'AbortError') setStatus('API unavailable. Start npm run dev:server.');
      });
    return () => controller.abort();
  }, []);
  return (
    <main>
      <p className="eyebrow">HACKRICE16</p>
      <h1>Ready to build.</h1>
      <p>React interface. Electron desktop. Node.js backend.</p>
      <div role="status">{status}</div>
      <p className="hint">Edit <code>src/main.jsx</code> to get started.</p>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
);
