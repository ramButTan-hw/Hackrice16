const panes = { camera: 'Privacy_Camera', microphone: 'Privacy_Microphone', screen: 'Privacy_ScreenCapture', accessibility: 'Privacy_Accessibility' };

exports.createPermissions = function ({ platform = process.platform, systemPreferences, shell, desktopCapturer }) {
  const pending = new Map();
  function validate(kind) { if (!Object.hasOwn(panes, kind)) throw new Error('Invalid permission.'); }
  function status(kind) {
    validate(kind);
    if (kind === 'accessibility') {
      if (platform !== 'darwin' || typeof systemPreferences?.isTrustedAccessibilityClient !== 'function') return 'unknown';
      // Inspect readiness without opening a macOS prompt during routine refreshes.
      try { return systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied'; }
      catch { return 'unknown'; }
    }
    return ['darwin', 'win32'].includes(platform) ? systemPreferences.getMediaAccessStatus(kind) : 'unknown';
  }
  async function request(kind) {
    validate(kind);
    if (kind === 'accessibility') return status(kind);
    if (platform !== 'darwin') return status(kind);
    if (pending.has(kind)) return pending.get(kind);
    const operation = (async () => {
      if (status(kind) === 'not-determined' || (kind === 'screen' && status(kind) !== 'granted')) {
        if (kind === 'screen') {
          // Screen consent is triggered by capture, not askForMediaAccess.
          // Discard this tiny permission-probe image without sending or saving it.
          try { await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }); }
          catch { throw new Error('Screen access is unavailable. Open Session → Device permissions → Screen Recording → Open Settings, allow Electron/Acumen, then fully quit and reopen the app.'); }
        } else await systemPreferences.askForMediaAccess(kind);
      }
      return status(kind);
    })();
    pending.set(kind, operation);
    try { return await operation; } finally { pending.delete(kind); }
  }
  async function ensure(kind) {
    const value = await request(kind);
    if (platform === 'darwin' && value !== 'granted') {
      throw new Error(`Allow ${kind === 'screen' ? 'Screen Recording' : kind} in Session → Device permissions → Open Settings, then fully quit and reopen Acumen. macOS currently reports ${value}.`);
    }
  }
  return {
    status: () => ({ platform, ...Object.fromEntries(Object.keys(panes).map(kind => [kind, status(kind)])) }),
    request, ensure,
    async openSettings(kind) {
      validate(kind);
      if (platform !== 'darwin') throw new Error('Open your operating system privacy settings manually.');
      if (kind === 'screen') await request(kind).catch(() => {});
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?' + panes[kind]);
    },
  };
};

exports.installMediaPermissions = function (session, { origin, allowedContents, permissions }) {
  function trusted(contents, url, isMainFrame) {
    try { return Boolean(contents && allowedContents(contents) && isMainFrame !== false && new URL(contents.getURL()).origin === origin && new URL(url).origin === origin); }
    catch { return false; }
  }
  session.setPermissionCheckHandler((contents, permission, requestingOrigin, details) =>
    permission === 'media' && trusted(contents, requestingOrigin, details?.isMainFrame));
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const types = details?.mediaTypes;
    if (permission !== 'media' || !trusted(contents, details?.requestingUrl, details?.isMainFrame) || !types?.length || types.some(type => !['audio', 'video'].includes(type))) return callback(false);
    void (async () => {
      for (const type of types) await permissions.ensure(type === 'audio' ? 'microphone' : 'camera');
    })().then(() => callback(true), () => callback(false));
  });
};
