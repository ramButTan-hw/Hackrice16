function createPresage({ loadSdk = () => require('@smartspectra/node-sdk'), now = Date.now, idle = () => 0 } = {}) {
  let sdk, owner, stopping;
  let lastFrame = -Infinity, lastMetric = 0, lastStamp = '';
  const emit = value => { if (owner && !owner.isDestroyed()) owner.send('presage:event', value); };
  async function stop() {
    if (stopping) return stopping;
    const current = sdk; sdk = null;
    stopping = (async () => {
      try { if (current) { try { await current.stopAsync(); } finally { await current.destroy(); } } }
      finally { emit({ type: 'stopped' }); owner = null; }
    })();
    try { await stopping; } finally { stopping = null; }
  }
  return {
    status: () => ({ active: Boolean(sdk) }),
    async start(sender) {
      if (sdk || stopping) throw new Error('Camera monitoring is already running or stopping.');
      if (!process.env.PRESAGE_API_KEY) throw new Error('Add PRESAGE_API_KEY to .env and restart the desktop app.');
      const { SmartSpectraSDK, breathingMetrics, cardioMetrics, decodeMetrics } = loadSdk();
      owner = sender;
      try {
        sdk = new SmartSpectraSDK({ apiKey: process.env.PRESAGE_API_KEY, requestedMetrics: [...breathingMetrics, ...cardioMetrics] });
        lastMetric = 0; lastStamp = ''; lastFrame = -Infinity;
        sdk.on('validationStatus', (code, _ts, hint) => emit({ type: 'validation', code, hint }));
        sdk.on('error', () => { emit({ type: 'error', message: 'Presage could not finish this reading. Check your key, credits, and connection.' }); void stop().catch(() => {}); });
        sdk.on('metrics', buf => {
          if (!sdk || now() - lastMetric < 2000) return;
          try {
            const metrics = decodeMetrics(buf);
            const pulse = metrics.cardio?.pulseRate?.at(-1);
            const breath = metrics.breathing?.rate?.at(-1);
            if (!pulse && !breath) return;
            const stamp = `${pulse?.timestamp ?? ''}/${breath?.timestamp ?? ''}`;
            if (stamp === lastStamp) return;
            lastStamp = stamp; lastMetric = now();
            const valid = (m, min, max) => Number.isFinite(m?.value) && m.value >= min && m.value <= max ? m.value : null;
            const confidence = m => m?.stable === true && Number.isFinite(m.confidence) ? Math.max(0, Math.min(1, m.confidence / 100)) : 0;
            const hrv = metrics.cardio?.hrv?.at(-1);
            emit({ type: 'sample', sample: { timestamp: now(), source: 'presage', heartRate: valid(pulse, 20, 250), breathingRate: valid(breath, 1, 80), hrv: confidence(hrv) >= 0.7 ? valid({ value: hrv.rmssd }, 0, 500) : null, quality: Math.min(confidence(pulse), confidence(breath)), idleSeconds: idle(), onBreak: false } });
          } catch { /* Ignore malformed packets; do not invent readings. */ }
        });
        sdk.useCustomInput();
        sdk.start();
        return this.status();
      } catch (error) { await stop(); throw error; }
    },
    frame(sender, frame) {
      if (!sdk || sender !== owner) return false;
      // Bound IPC memory and drop excess frames instead of building a queue.
      if (now() - lastFrame < 30) return false;
      const { width, height, data } = frame || {};
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 1280 || height > 720 || !(data instanceof ArrayBuffer) || data.byteLength !== width * height * 4) throw new Error('Invalid camera frame.');
      lastFrame = now();
      const { PixelFormat } = loadSdk();
      return sdk.sendFrame(Buffer.from(data), width, height, width * 4, PixelFormat.kRGBA, Math.floor(now() * 1000));
    },
    stop,
  };
}
module.exports = { createPresage };
