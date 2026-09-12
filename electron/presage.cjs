function presageError(code, detail, retryable) {
  const messages = {
    1: 'Presage is in an invalid state. Stop and resume monitoring.',
    2: 'Presage rejected authentication. Check your Physiology API key in the developer portal.',
    3: 'Presage could not configure the requested metrics.',
    4: 'Your Presage account has no remaining credits.',
    5: 'Presage could not reach its server. Check your network connection.',
    6: 'The Presage server returned an error. Try again later.',
    7: 'Presage could not access its video input.',
    8: 'Presage processing failed. The SDK diagnostic log contains the underlying cause.',
    9: 'Presage could not convert a camera frame.',
    10: 'Presage received out-of-order frame timestamps.',
    11: 'Presage detected a gap in camera frames.',
  };
  let safeDetail = typeof detail === 'string' ? detail : '';
  for (const [name, value] of Object.entries(process.env)) {
    if (/KEY|TOKEN|SECRET/i.test(name) && value) safeDetail = safeDetail.split(value).join('[redacted]');
  }
  return { type: 'error', code, retryable: Boolean(retryable), message: `${messages[code] || 'Presage failed to start.'}${Number.isInteger(code) ? ` (SDK ${code})` : ''}`, detail: safeDetail.slice(0, 1000) };
}
function createPresage({ loadSdk = () => require('@smartspectra/node-sdk'), now = Date.now, idle = () => 0, logError = error => console.error('Presage SDK:', error) } = {}) {
  let sdk, owner, stopping;
  let lastFrame = -Infinity, lastMetric = 0, lastStamp = '';
  let latest = {}, lastValidation = null;
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
        latest = {}; lastValidation = null;
        sdk.on('validationStatus', (code, _ts, hint) => { if (sdk && code !== lastValidation) { lastValidation = code; emit({ type: 'validation', code, hint }); } });
        sdk.on('processingStatus', status => emit({ type: 'processing', status }));
        sdk.on('error', (code, detail, retryable) => {
          const error = presageError(code, detail, retryable);
          logError(error); emit(error); void stop().catch(() => {});
        });
        sdk.on('metrics', buf => {
          if (!sdk) return;
          try {
            const metrics = decodeMetrics(buf);
            // Metric groups can arrive in separate packets. Retain each group's
            // latest distinct measurement briefly instead of requiring one packet.
            for (const [name, value] of Object.entries({ pulse: metrics.cardio?.pulseRate?.at(-1), breath: metrics.breathing?.rate?.at(-1), hrv: metrics.cardio?.hrv?.at(-1) })) {
              if (value && String(value.timestamp) !== latest[name]?.stamp) latest[name] = { value, stamp: String(value.timestamp), receivedAt: now() };
            }
            if (now() - lastMetric < 2000) return;
            lastMetric = now();
            const compact = value => {
              if (value === null || typeof value !== 'object') return value;
              if (Array.isArray(value)) return { count: value.length, latest: value.slice(-2).map(compact) };
              return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, compact(value)]));
            };
            const packet = compact(metrics);
            emit({ type: 'metrics', data: JSON.stringify(packet).length <= 20000 ? packet : { returnedFields: Object.keys(metrics), note: 'Packet too large; showing latest vital measurements.', pulse: compact(metrics.cardio?.pulseRate?.at(-1) ?? null), breathing: compact(metrics.breathing?.rate?.at(-1) ?? null) } });
            const recent = name => latest[name] && now() - latest[name].receivedAt <= 10000 ? latest[name].value : null;
            const pulse = recent('pulse'), breath = recent('breath');
            if (!pulse && !breath) return;
            const stamp = `${pulse?.timestamp ?? ''}/${breath?.timestamp ?? ''}`;
            if (stamp === lastStamp) return;
            lastStamp = stamp;
            const valid = (m, min, max) => Number.isFinite(m?.value) && m.value >= min && m.value <= max ? m.value : null;
            const confidence = m => m?.stable === true && Number.isFinite(m.confidence) ? Math.max(0, Math.min(1, m.confidence / 100)) : 0;
            const hrv = recent('hrv');
            emit({ type: 'sample', sample: { timestamp: now(), source: 'presage', heartRate: valid(pulse, 20, 250), breathingRate: valid(breath, 1, 80), hrv: confidence(hrv) >= 0.7 ? valid({ value: hrv.rmssd }, 0, 500) : null, quality: Math.min(confidence(pulse), confidence(breath)), qualityByMetric: { heartRate: confidence(pulse), breathingRate: confidence(breath), hrv: confidence(hrv) }, idleSeconds: idle(), onBreak: false } });
          } catch { emit({ type: 'error', message: 'Could not decode a Presage metrics packet.', code: null }); }
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
module.exports = { createPresage, presageError };
