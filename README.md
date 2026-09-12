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
app and backend. `MATLAB_EXECUTABLE` defaults to the installed
`C:/Program Files/MATLAB/R2026a/bin/matlab.exe`; use your own licensed installation
on another machine. Start a session to open the camera and begin monitoring.

Presage runs continuously until Pause monitoring, session end, window close or
system suspend. Changing tabs, minimizing or collapsing does not reset capture.
Only breathing and cardio metrics are requested. The preview shows positioning
feedback; frames are processed by Presage, never sent to Gemini or stored in the
session database. Samples are saved at most every two seconds. SDK confidence is
converted from percent to 0–1, and unstable readings are not treated as reliable.
Electron reads system inactivity every second, including during camera signal gaps.

One persistent MATLAB worker analyzes a rolling 60-second window every ten
seconds. It computes averages, variability, slopes and changes relative to the
first continuous 30 seconds of reliable baseline data. Automatic analysis waits
at least the first session minute AND for sufficient reliable data. Elapsed time
alone does not establish readiness. Missing or stale data pauses Gemini analysis;
there is no silent JavaScript replacement for MATLAB.

Gemini automatically reviews the MATLAB report, latest Presage sample, inactivity,
task, and previous intervention every 60 seconds. A sustained signal/activity
change can advance the next review, never sooner than 45 seconds after the last
request. Six automatic attempts per session is a hard persisted budget, including
failed calls; pause/resume and backend restart do not reset it. Responses are
structured decisions with a 512-token output cap. For the default 2.5 Flash model,
thinking is disabled for these small classification requests. Actual returned
usage counts and decisions are recorded. These are separate from manual Chat calls.

Gemini may choose no intervention. Delivered suggestions have a separate 90-second
cooldown. Enable **Speak suggestions** for optional ElevenLabs audio; failed voice
generation does not lose the text. Playback controls remain available if the OS
blocks autoplay. Inactivity alone does not establish distraction, and physiological
changes do not diagnose stress, emotion or productivity.

The Session panel shows camera status, MATLAB readiness, analysis count and the
latest decision. The compact timer indicates when the camera is on. Existing
manual Chat remains available with bounded history. For a five-minute demo, expect
roughly four to six automatic reviews if signal readiness and provider latency
permit; monitoring is not artificially cut short to achieve that count.

Validation: `npm test`, `npm run build`, and `node scripts/verify-matlab.js`.
The MATLAB verification uses synthetic data and does not call paid AI services.
`node scripts/verify-analysis.js` makes one live Gemini request using that synthetic
MATLAB report; it requires the local Gemini key and consumes a small API request.

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
