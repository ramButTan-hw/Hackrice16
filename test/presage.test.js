import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createPresage, WINDOW_MS, COOLDOWN_MS } = createRequire(import.meta.url)('../electron/presage.cjs');

test('camera check-ins have a hard deadline, cooldown, bounded frames and teardown', async () => {
  const oldKey = process.env.PRESAGE_API_KEY;
  process.env.PRESAGE_API_KEY = 'test';
  let now = 1000000, scheduled, instance, stopped = 0, destroyed = 0;
  const events = [], frames = [];
  const sender = { isDestroyed: () => false, send: (_channel, event) => events.push(event) };
  class SDK {
    constructor(options) { this.handlers = {}; instance = this; assert.deepEqual(options.requestedMetrics, [1, 2]); }
    on(name, callback) { this.handlers[name] = callback; }
    useCustomInput() {}
    start() {}
    sendFrame(...args) { frames.push(args); return true; }
    async stopAsync() { stopped++; }
    async destroy() { destroyed++; }
  }
  const controller = createPresage({ now: () => now, schedule: (fn, delay) => { scheduled = fn; assert.equal(delay, WINDOW_MS); }, cancel: () => {}, loadSdk: () => ({ SmartSpectraSDK: SDK, breathingMetrics: [1], cardioMetrics: [2], PixelFormat: { kRGBA: 2 }, decodeMetrics: data => data }) });
  try {
    const status = await controller.start(sender);
    assert.equal(status.deadline, now + WINDOW_MS);
    assert.equal(status.nextAllowedAt, now + COOLDOWN_MS);
    const frame = { width: 2, height: 2, data: new ArrayBuffer(16) };
    assert.equal(controller.frame({}, frame), false);
    assert.equal(controller.frame(sender, frame), true);
    assert.equal(controller.frame(sender, frame), false);
    assert.equal(frames[0][4], 2);
    now += 34;
    assert.throws(() => controller.frame(sender, { ...frame, width: 2000 }), /Invalid camera frame/);
    const metric = { value: 70, stable: true, confidence: 85, timestamp: now * 1000 };
    instance.handlers.metrics({ cardio: { pulseRate: [metric] }, breathing: { rate: [{ ...metric, value: 15 }] } });
    assert.equal(events.at(-1).sample.quality, .85);
    assert.equal(events.at(-1).sample.heartRate, 70);
    const count = events.length;
    instance.handlers.metrics({ cardio: { pulseRate: [metric] } });
    assert.equal(events.length, count);
    now += WINDOW_MS;
    assert.equal(controller.frame(sender, frame), false);
    scheduled(); await controller.stop();
    assert.equal(stopped, 1); assert.equal(destroyed, 1);
    assert.equal(controller.status().active, false);
    await assert.rejects(controller.start(sender), /cooldown/);
    now += COOLDOWN_MS;
    await controller.start(sender); await controller.stop();
    assert.equal(destroyed, 2);
  } finally { oldKey === undefined ? delete process.env.PRESAGE_API_KEY : process.env.PRESAGE_API_KEY = oldKey; }
});

test('unconfigured camera never loads native code', async () => {
  const oldKey = process.env.PRESAGE_API_KEY;
  delete process.env.PRESAGE_API_KEY;
  try {
    const controller = createPresage({ loadSdk: () => { throw new Error('should not load'); } });
    await assert.rejects(controller.start({}), /PRESAGE_API_KEY/);
    assert.equal(controller.status().active, false);
  } finally { if (oldKey !== undefined) process.env.PRESAGE_API_KEY = oldKey; }
});
