# macOS source setup and acceptance tests

The full app requires an Apple Silicon Mac running native ARM64 Node 22.12+ and Python 3.12. Presage does not ship an Intel macOS runtime. Do not use Rosetta or copy Windows node_modules or data/wake-env. These changes have automated coverage on Windows; actual macOS privacy prompts and hardware still need this checklist on a Mac.

## Install and start

Push the latest team branch, clone it on the Mac, and switch to that branch. From the repository root:

```bash
node -p "process.platform + ' ' + process.arch"
# Must print darwin arm64
npm ci
test -f .env || cp .env.example .env
# Edit .env privately using docs/DEVICE_SETUP.md
python3.12 scripts/setup-wake.py
npm run setup:attention
npm run check:macos
npm test
npm run build
npm run dev
```

Use DATA_PROVIDER=sqlite for isolated device testing. Leave WAKE_PYTHON empty unless overriding with this Mac's Python path. Wake inference explicitly uses ONNX; no TFLite installation is needed on macOS. Google requires the Desktop OAuth client and this teammate's account in the test-user list. `npm start` also supports Google sign-in: its embedded server now supplies the actual loopback port to OAuth.

The macOS check runs automatically before `npm run dev` and `npm start`. It validates ARM64 Node/Electron, loads the Presage native dependency closure without starting monitoring, and checks Electron's camera/microphone usage descriptions. If a development Electron bundle lacks descriptions, it adds them and ad-hoc signs that local bundle again. This is not distribution signing. A fresh npm ci replaces that bundle and may require consent again.

## Permissions in the app

Open **Session → Device permissions**, available on macOS even before a session starts. It shows the current camera, microphone, Screen Recording, and Accessibility statuses. **Allow** requests access. After denial, **Open Settings** opens the appropriate Privacy & Security pane. Status refreshes when you return to the app.

During development, grant access to **Electron**. A future packaged build will use its own app identity and require separate permission. Camera and microphone requests also happen when you first use those features. Screen permission is requested only through screen help or the permission control; the permission probe is discarded without saving or uploading an image. Screen access can initially appear denied before macOS has prompted, so the app attempts the native capture request before directing you to settings.

macOS controls the final approval. It cannot be enabled programmatically. After changing permission in System Settings, fully quit and reopen the app, then retry. A managed/restricted permission may require the device administrator. If a settings deep link does not select the pane on your macOS version, open **System Settings → Privacy & Security** manually and select Camera, Microphone, or Screen Recording / Screen & System Audio Recording. Accessibility is required for the guide’s “Do this step” and “Do it for me” mouse and keyboard actions. Grant it to the Electron bundle running this checkout. General chat and widgets do not need Accessibility; a separate Input Monitoring grant is not currently requested.

## Acceptance tests on a real Mac

1. Start with camera/microphone unapproved. Start a session, accept camera access and check live preview and Presage readings. Decline microphone first: text chat and the timer should continue. Use Device permissions to enable it, quit/reopen, then test “hey Jarvis” and follow-up speech.
2. Decline Screen Recording on the first screen request. Confirm the error explains recovery and no screenshot is sent. Enable it, quit/reopen and use Cmd+Shift+Space or request screen help. Verify it captures the intended display, including with an external monitor attached.
3. Run pulse-rise demo and confirm its check-in; then test a real session, attention calibration, looking sideways/down and being out of view. Wake detection accuracy must be tested with the Mac microphone, not just a model-load check.
4. Connect Google, create and edit a test Doc/Slides deck, and test image insertion. Repeat sign-in with `npm start` to exercise its dynamically assigned port.
5. Close the companion panel only: the work session should continue. Close the main window or use Cmd+Q: reopening must show an ended session and stopped timer. Also test sleep/wake; monitoring is stopped on suspend and can be resumed after waking.
6. Revoke a permission while running, then retry. Confirm a recoverable error rather than a crash. Re-enable and relaunch.

## Packaging status

`npm run build` compiles the frontend; it does not produce a distributable .app/.dmg. Packaging still needs an ARM64 packager configuration, writable app-data/config paths, wake runtime/model bundling, native Presage libraries outside ASAR, usage descriptions, signing and notarization. Do not treat the development bundle checks as verification of an installer.

References: [Electron media permissions](https://www.electronjs.org/docs/latest/api/system-preferences), [Electron permission handlers](https://www.electronjs.org/docs/latest/api/session), [Presage Node SDK](https://smartspectra.presagetech.com/docs/nodejs/).
