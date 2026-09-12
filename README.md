# Hackrice16

Chat: set `GEMINI_API_KEY` in your local `.env` and restart the server. Optionally
set `GEMINI_MODEL` (default `gemini-2.5-flash`). The Chat tab sends text to Gemini
through the Node backend. “Include session” shares the task and interpreted state,
not raw camera frames. Enter sends; Shift+Enter adds a line. Chat history stays in
memory while the app is open (including when collapsed); Clear chat removes it.
Chat cannot control the app or computer. Keep API keys on the server.

Optional speech: set `ELEVENLABS_API_KEY` in `.env` and restart. Enable **Voice
reply** before sending, then use the reply's audio controls to listen. Reply text
is sent to ElevenLabs only when enabled; text chat still works if speech fails.
`ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL` override the default voice and
`eleven_v3` model. This uses the [ElevenLabs REST API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
through the existing backend, with no additional SDK dependencies.

The frontend is a minimal smoked-green glass session panel. Use the top-right
collapse button to shrink Electron into a compact timer pill; expand restores the
session view. Drag the empty header area to move the window. Pinning is optional and off
by default. Session start/end and history use the existing backend; no camera
readings or AI messages are fabricated. Active sessions restore on reopening.

## Continuous monitoring and automatic analysis

Set `PRESAGE_API_KEY` and `GEMINI_API_KEY` in `.env`, then restart the desktop
app and backend. Start a session to open the camera and begin monitoring.

Presage runs continuously until Pause monitoring, session end, window close or
system suspend. Changing tabs, minimizing or collapsing does not reset capture.
Only breathing and cardio metrics are requested. The preview shows positioning
feedback; frames are processed by Presage, never sent to Gemini or stored in the
session database. Samples are saved at most every two seconds. SDK confidence is
converted from percent to 0–1, and unstable readings are not treated as reliable.
Electron reads system inactivity every second, including during camera signal gaps.

JavaScript in the Node backend analyzes a rolling 60-second window every ten
seconds. It computes averages, variability, slopes and changes relative to the
first continuous 30 seconds of reliable baseline data for each metric separately.
Reliable heart rate can be displayed while breathing is unavailable. Physiological
check-ins use the personal pulse baseline and sustained-change rules below.
Readings collected during voice help and breaks are excluded from analysis.
Missing or stale samples pause physiological analysis. No external analytics runtime
or license is required. Baselines reset after a completed break.

Gemini reviews only new local events: a sustained physiological change or a
40-minute uninterrupted work block. Stable work produces no periodic AI calls.
Each signal earns at most one point per work block. Six automatic attempts per
session is a hard persisted budget, including
failed calls; pause/resume and backend restart do not reset it. Responses are
structured decisions with a 512-token output cap. For the default 2.5 Flash model,
thinking is disabled for these small classification requests. Actual returned
usage counts and decisions are recorded. These are separate from manual Chat calls.

Gemini may choose no intervention. Delivered suggestions have a separate 90-second
cooldown. Enable **Speak suggestions** for optional ElevenLabs audio; failed voice
generation does not lose the text. Playback controls remain available if the OS
blocks autoplay. Inactivity alone does not establish distraction, and physiological
changes do not diagnose stress, emotion or productivity.

The Session panel shows camera status, local analysis readiness, analysis count and the
latest decision. The Log tab shows Presage values, confidence and stability,
validation feedback, local analysis reports, and Gemini requests, responses and errors.
Download JSON exports the retained log (the latest 180 events per session).
Large SDK arrays retain their count and latest two entries; video is never logged.
The compact timer indicates when the camera is on. Existing
manual Chat remains available with bounded history. A five-minute session can
legitimately have no automatic check-in. The help button works at any time.

Validation: `npm test` and `npm run build`. The automated analytics tests use
synthetic data and do not call paid AI services.
If Presage fails to start, run `node scripts/diagnose-presage.cjs` for a short
startup probe with synthetic blank frames (no camera). It contacts Presage using
the configured key and filters/redacts native diagnostics. HTTP 401 in device
pairing or usage verification means the server rejected authentication; verify
the active Physiology API key in the developer portal, update `.env`, then fully
restart Electron. The SDK may report this as generic processing error 8 instead
of authentication error 2. Do not infer a network outage from that generic code.
`node scripts/verify-analysis.js` makes one live Gemini request using a synthetic
local analysis report; it requires the local Gemini key and consumes a small API request.

Database/state/analytics setup and teammate contracts: [Data handoff](docs/DATA_HANDOFF.md).
Run `npm test` for backend checks and `npm run demo:data` for a complete simulated session export.

React + Vite frontend, Electron desktop shell, and an Express API on Node.js.

## Requirements

Node.js 22.12 or newer and npm.

## Start developing

~~~sh
npm install
npm run dev
~~~

This starts the Node API on http://127.0.0.1:3001, Vite on
http://127.0.0.1:5173, and the Electron window. React updates automatically;
the API restarts when its files change. Restart npm run dev after editing
Electron code. Closing Electron stops the development processes.

## Commands

- npm run dev: start the full desktop development environment.
- npm run dev:web: start only Vite; run npm run dev:server separately for API access.
- npm run dev:server: run the API with Node's file watcher.
- npm run build: build React into dist.
- npm start: build React and open Electron with an embedded Node server.
- npm run server: serve the API and an existing dist build on port 3001.
- npm run preview: preview the frontend build; requires the API separately.

Set PORT to override the standalone API port. The Vite proxy and development
startup use port 3001 by default; update them if changing PORT.
The production desktop server chooses an available loopback port automatically.

## Project layout

- src/: React components and styles.
- electron/main.cjs: Electron lifecycle and desktop window.
- server/app.js: shared API routes and static frontend hosting.
- server/index.js: standalone Node API entry point.
- vite.config.js: frontend development server and API proxy.

The renderer uses sandboxing and context isolation with Node integration disabled.
Add server endpoints for backend work; do not expose unrestricted Node access
to the renderer. Installer packaging and code signing are not configured.

## Manual sessions and help on demand

Click Start and Stop to control the work session. Presage starts with the session.
Get help / check in opens a popup with Doing fine, Stuck, and Tired choices.
Stuck opens a short Gemini Live conversation; Talk to Gemini does the same.
Live uses Google's native voice, not ElevenLabs. Optional Speak suggestions
continues to use ElevenLabs for automatic check-ins.

The screenshot checkbox controls a single capture of the display under the
cursor when Live connects. Additional screenshots require the update button.
Screenshots and microphone audio are not saved; text transcripts remain in the
popup's memory. Gemini can record an explicitly spoken feeling through a narrow
validated tool. It cannot start/stop sessions, click, or type. Live closes after
two minutes, on close/end, reload, or system suspend. Wait for the connection
chime before speaking. API quota failures do not cause automatic reconnects.

Break-suggestion score (a product heuristic, not a stress diagnosis): sustained
reliable physiological change +1, 40-minute work block +1, user reports tired +3,
user reports fine -2. The score is clamped to 0–5. User reports replace their
previous contribution; duplicates do not add points. At 3, a break is offered.
Stuck routes to help without adding fatigue points. A completed break of at
least one minute resets the score and starts a new work block. Dismissals quiet
check-ins for five minutes. Score reasons, answers, helpfulness feedback, and
biometric samples persist inside the session's database record and event log.

## Optional local wake word

The help button and Ctrl+Shift+Space work without wake-word configuration.
To enable “hey Jarvis”, run `py -3.12 scripts/setup-wake.py` once. This creates
an isolated environment in `data/wake-env` and downloads openWakeWord's model.
Python 3.10–3.12 is supported by this setup script. No account or key is needed.
`WAKE_PYTHON` optionally overrides the interpreter location.

Restart Electron, start a session manually, then enable the local wake-word
checkbox. Detection runs on this computer; microphone frames are not sent to
Google until a help conversation connects. With wake word off, the microphone
is off between conversations. A funded Gemini project is still required for
Live and automatic AI check-ins. Keys stay out of the renderer and source code.
The pretrained openWakeWord models use CC BY-NC-SA 4.0 (noncommercial);
see https://github.com/dscripka/openWakeWord for model licensing.

### Pulse check-in heuristic

Collect 60 continuous seconds of good pulse data for a personal median baseline.
Smooth current pulse over 10 seconds. A rise must exceed the largest of 8 bpm,
12% of baseline, or three robust baseline deviations, and persist for 60 seconds.
Reliable breathing elevation supports a shorter 45-second hold; it is optional.
Brief spikes, stale/poor samples, inactivity, and assistance pauses do not count.
After a check-in, 30 seconds below half the threshold re-arms the detector.
A completed break resets the baseline. Physiological points are capped at one
per work block, and existing quiet periods and Gemini budgets still apply.
These are tunable product heuristics, not validated stress or attention measures.
The companion shows baseline, rise, hold time, and detector phase for testing.

## Pulse-rise demonstration

End any active session, enter a task, then choose **Demo pulse rise** in the bottom-right corner. This starts a separate `source: demo` session, visibly labeled simulated,
with a live camera preview (no Presage measurement in demo mode). The backend
supplies 72 bpm for 20 seconds, 94 bpm until 100 seconds, then 72 bpm recovery
until five minutes. Inactivity and breathing
are also synthetic. Synthetic samples follow a fixed two-second timeline and overdue demo frames are
batched after database delays. They are never mixed into real Presage sessions.
Demo timing uses a 20-second baseline and 30-second hold, normally requesting a
Gemini review around 60 seconds. Real-session thresholds stay unchanged;
Gemini can still choose no intervention. Select “I'm stuck” to demonstrate real
screen-aware Live help. End the session manually and start another demo to replay.
The normal API budget applies. Automated tests use a fake Gemini response; actual
provider decisions and microphone behavior require an in-app rehearsal.

### Spoken check-in window

A delivered check-in now opens a separate desktop voice window and starts Gemini
Live, which speaks first. The window displays Gemini's output transcription;
answer aloud instead of selecting feeling buttons. The microphone is active
during this two-minute conversation. Closing the window stops audio and the
microphone; optional local wake listening resumes if enabled. Screen sharing
uses the existing checkbox preference. Gemini Live handles input and streams its own audio immediately, with matching
output transcription. Interruptions and window closure stop playback. Manual chat's ElevenLabs option is unchanged.

Appearance settings also open in a separate desktop window and synchronize across
windows. Browser-only previews retain their in-page fallback controls.

The voice window is a compact, draggable, frameless overlay positioned near the
upper-right of the current display. It opens without taking keyboard focus.
Say “not now,” “I'm done,” or “I don't need help” to dismiss voice assistance;
the work session stays active. Gemini also recognizes contextual dismissal via
a dedicated close-assistance tool. Escape and the close button remain available.
Audio playback uses a 200ms startup buffer and contiguous chunk scheduling.
It replenishes the buffer only after a real underrun, not when queued audio
is merely close to running out. Voice diagnostics include server interruption
counts and the largest observed gap between audio packets.

Demo pulse gently fluctuates around 72 bpm at baseline and 94 bpm while elevated,
with a smooth eight-second rise and twenty-second recovery. The synthetic curve
is repeatable so database batching does not change the scenario.

### Check-in request resilience

Automatic reviews use `GEMINI_CHECKIN_MODEL` (default `gemini-3.6-flash`),
independently of manual chat. Normal sessions retain a 20-second request limit
and skip failed reviews. The labeled pulse demo uses an eight-second limit;
on failure it delivers one neutral local check-in with `provider: demo`.
Failures and request duration stay in the log, and the last error remains visible
until a successful review. Gemini Live is a separate connection and can still
fail independently; the demo fallback does not guarantee voice availability.

## Spoken input and persistent work memory

The companion now uses hold-to-talk ElevenLabs Scribe transcription and streaming Gemini text replies. Ctrl+Shift+Space opens the overlay during a manually started session. Hold the talk button (or focus it and hold Space), speak, then release to send. Typing remains available. Gemini Live and wake-word listening are no longer started by the UI.

Set ELEVENLABS_API_KEY and BACKBOARD_API_KEY in the private .env file. The existing GEMINI_API_KEY and GEMINI_MODEL supply text replies. Restart both backend and Electron after changing credentials or preload code. Start everything with npm run dev, or the backend alone with npm run dev:server.

Screen is opt-in for each conversation and sends one screenshot with each question. The app does not write recordings or screenshots to disk. Memory is enabled by default: bounded work-context excerpts (user statements and explicitly labeled, unconfirmed assistant suggestions) are stored in Backboard. These are excerpts, not verified facts or inferred biometric diagnoses. The Memories button lists saved entries and Forget deletes individual entries. Uncheck Memory to stop recall and saving for that conversation.

Backboard creates separate real and demo assistants on first use; their IDs persist in ignored data/backboard-assistants.json. This is a single-user local installation, not a multi-user identity system. Existing session storage remains unchanged. Backboard failures do not prevent Gemini replies, and the UI reports memory save/recall status.

Verification: npm test, npm run build. The opt-in real-provider smoke test is node scripts/verify-text-companion.js; it uses the existing public audio fixture in data/live-probe.pcm, checks Backboard with a temporary demo memory and deletes that memory, then checks streaming Gemini text.


### Hands-free Jarvis update

During active manual sessions, local openWakeWord listens for “hey Jarvis” by default. Disable it using the session checkbox. Wake audio stays local. The wake phrase or Ctrl+Shift+Space opens the overlay and starts a short recording after a chime. About 1.4 seconds of silence ends an utterance and sends it to ElevenLabs, then Gemini streams text. After an answer the companion listens for a follow-up; 12 seconds without speech returns to wake detection. “Not now” or “I’m done” closes help. Check-ins also open this listening flow. No Gemini Live socket is used. The optional Listen button is a click-to-start fallback, never hold-to-talk. If the local model is absent, run scripts/setup-wake.py with Python 3.12. Restart Electron to load the updated IPC controls.
