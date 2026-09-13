# Jarvis functional QA — September 13, 2026

Overall: the automated suite, live text/provider checks, and core widget/planner UI passed. This is **not a full live-device or arbitrary desktop-takeover certification**. The remaining limits are listed separately below.

## Environment and isolation

macOS ARM64, Node 26.8.1, Electron 44.3.0. Tests used disposable SQLite databases and Electron profiles. The connected QA instance retained Gemini and ElevenLabs configuration, but disabled Google OAuth, Backboard, and Supabase writes. Normal user records were not modified. Supabase was checked read-only. The rehearsal instance disabled all cloud providers, camera, and microphone.

## Results

| Area | Result and evidence |
| --- | --- |
| Automated suite | **226 tests passed, zero failures.** Includes session lifecycle, signal quality/staleness, shutdown, audio cleanup races, expression opt-in, action routing, guide authorization/cancellation, Google previews/idempotency, planner conflicts, and persistence. Mocked tests do not establish live OS/provider success. |
| Production frontend / development startup | `npm run build` passed. `npm run dev` started the API, Vite, and Electron at the expected URLs with an isolated database. Closing Electron stopped the dev servers. The concurrency runner returned 1 when Vite received its expected SIGTERM; Electron itself exited 0. |
| Readiness and deterministic workflow | `npm run demo:check` and `npm run demo:verify` passed. The latter exercised a synthetic sustained-change check-in, checklist, timer, summary totals, missing HRV, planner conflict, and database reopen. |
| Gemini | Real provider answered a synthetic biology question. Streaming reply also rendered successfully in the Electron chat. |
| ElevenLabs transcription | Real API recognized a generated “Start a one-minute timer” audio fixture. This was not a microphone recording. |
| Wake model | Real local ONNX inference recognized generated “Hey Jarvis” audio; the silence control did not trigger. Room noise and microphone pickup remain untested. |
| Supabase | Read-only queries succeeded for `session_records`, `planner_records`, and `widget_records`. Live cloud writes and multi-client concurrency were not exercised. |
| Widgets menu | Timer, Checklist, and Planner opened as separate native windows. |
| Timer | Typed Jarvis request opened an immediately running one-minute timer. Pause, resume, completion while closed, reopening, five-minute break, and reset were exercised. Fixed break/reset display was retested successfully. |
| Checklist | Created three items from chat, checked one, added a disposable fourth item, removed that item, and retained the other three. |
| Planner | Month navigation and Today worked. Saved a work block; reopening preserved its agenda entry and calendar marker. Later suggestions avoided it with the configured buffer. Removal cleared both views. With no real history, suggestions correctly said “Availability only.” |
| Google previews | Gemini produced a document preview. Typed “confirm” surfaced the missing OAuth configuration error. Cancel marked the preview cancelled without saving. Actual OAuth/save/open and Calendar publication were not tested against an account. |
| Browser/app opening | Jarvis opened the local test-page URL in Chrome. “Open Calculator” launched Calculator, independently observed through its native UI. |
| Guide | Open, screenshot/model step generation, explicit voice-off state, and Stop/restoration worked. A real type attempt was rejected by the native target check; see the investigation below. |
| Offline session UI | Started a simulated session, collapsed/expanded the window, observed one labeled local check-in and sustained-rise evidence, ended the session, opened analytics, and reopened the saved recap from History. Missing HRV stayed unknown. |
| Permission display | Camera, Microphone, Screen Recording, and Accessibility all displayed granted. No device was opened or permission changed by this read. |
| Shutdown | The connected QA app exited cleanly after the activation-during-shutdown guard was added. |

## Corrections made during QA

- Timer duration now follows committed timer duration changes. A one-minute focus timer → five-minute break → reset correctly shows five minutes, Ready, and Focus time. A running break says “On a break.”
- Idle chat says “Click Listen or type,” avoiding a wake-listening promise when no listener is active.
- Native guide lookup now supports text-field roles, HTML linked labels, and placeholders while retaining secure-field rejection, fresh-screen checks, and foreground ownership checks. A new regression verifies that typing uses the grounded field coordinates. Native compilation passed during the test. Live typing success is **not established** by this change.
- App activation no longer creates a new window while shutdown is underway or complete.
- Corrected the recap’s singular “1 minute” label, found during the UI walkthrough.
- macOS setup documentation now correctly identifies Accessibility as required for guide mouse/keyboard input.

## Guide investigation and live limits

The disposable target was a local page with a normal labeled text field and an “Add task” button. Jarvis recognized the intended task, generated a type step, and attempted bounded takeover. It did not enter the text: the helper reported “This is not a verified ordinary text field.”

Instrumenting the isolated test instance showed that its stored foreground PID belonged first to Codex and then to the computer-use automation service, rather than Chrome. The native ownership check therefore rejected typing into Chrome. Bringing up the target through Jarvis's browser opener did not eliminate the automation-service focus interference. No successful native typing/clicking is claimed for this run. The added field lookup remains useful hardening, but cannot be called a proven cure for the user's original takeover issue based on this evidence.

The offline run reported desktop notifications unavailable; the visible check-in still appeared.

A tool-generated Escape also did not close the guide. Background key delivery cannot establish the real global shortcut behavior. Stop was verified. Marker-window creation was observed, but the native app screenshot tool excludes other floating windows, so exact marker visibility/position was not independently verified.

Before a demo, repeat the local target test with Chrome genuinely foreground and no automation service controlling focus: enter the goal in Jarvis, choose Do it for me, verify the text and final state, and test Escape during a preview. Repeat the intended Google Docs formatting and YouTube Music playlist tasks separately; neither was certified here.

## Still requiring live acceptance

- Real microphone capture, wake accuracy in the room, spoken guide replies, and speech output.
- Real Presage camera metrics, account entitlement for expression capture, expression-aware greeting/tone, permission denial/recovery, and camera release. Camera/microphone approval was requested during this run and had not arrived; synthetic checks do not substitute for it.
- Google account connection, actual Doc/Slides save and open, Calendar sync, and YouTube Music playlist playback.
- Successful native guide takeover, exact cursor placement, and a physical global Escape press.
- Packaged distribution, a teammate's machine, multi-monitor operation, and sleep/wake.

## Local evidence

Temporary logs and harnesses are in `/tmp/jarvis-functional-qa` (not committed and subject to OS cleanup): `tests-final.log`, `build-final.log`, `probes.json`, `probes.mjs`, `guide-tests.log`, and the isolated Electron profile. The probe result includes provider timings but no API keys or private database contents.
