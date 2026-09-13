# Jarvis — Hackrice16

A desktop work/study companion with manual sessions, Presage biometric monitoring, local “hey Jarvis” activation, ElevenLabs speech transcription, Gemini text and screen assistance, Backboard work memory, and Google Workspace previews.

## Set up another device

**Start with [the complete device setup guide](docs/DEVICE_SETUP.md).** It covers installation, every credential, wake detection, storage, Google consent, image generation, verification, troubleshooting, and moving your own data.

- [Wake-word setup and microphone troubleshooting](docs/WAKE_WORD_SETUP.md)
- [Google Docs, Slides, Calendar, and image workflows](docs/GOOGLE_WORKSPACE_SETUP.md)
- [Supabase migration](supabase/migrations/001_session_records.sql)
- [Original database handoff](docs/DATA_HANDOFF.md) — historical architecture notes, not the current full-app setup guide.

## Quick start

Requires Node.js 22.12+ and npm. Optional local wake detection requires Python 3.10–3.12; use 3.12. The full desktop workflow is tested on Windows.

```powershell
npm ci
if (!(Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
# Fill in the private .env credentials before starting.
py -3.12 scripts/setup-wake.py
npm run setup:attention
npm test
npm run build
npm run dev
```

The wake installer is optional for typed/click-to-listen use. Each device must install its own dependencies and wake environment. Never commit `.env` or copy another machine's `node_modules`/Python environment.

## Current companion workflow

Start sessions manually. Closing the main app window saves the active session as ended before exiting; minimizing, collapsing, or closing only the companion panel leaves it running. The manual Stop button remains available. During an active session, “hey Jarvis” or Ctrl+Shift+Space opens the companion. Wait for the chime, speak, then pause to submit. ElevenLabs transcribes the question and Gemini returns streaming text. Follow-up listening is automatic; silence returns to the local wake detector. The optional Listen button starts recording with a click. “Not now” or “I'm done” closes assistance without ending the session. The current UI does not use Gemini Live voice replies or hold-to-talk.

Screen context is optional. Explicit screen-to-notes/checklist/slide requests capture the current display once. Google actions show previews and require confirmation before saving. Deck edits replace the complete content at the existing link, so review all slides. Images can be generated directly in chat or attached to slide previews using an image-enabled Gemini key.

Local attention checks reuse the camera, with a short screen-position calibration, sustained-cue delay, and cooldown. Run `npm run setup:attention` on each device. The local detector uses head direction and phone visibility as hints, not proof of focus; no camera frames go to Gemini for this detector.

Presage runs real monitoring during a session. The separate **Demo pulse rise** button uses labeled, fluctuating synthetic readings with a live camera preview. It normally requests a review around one minute. Real check-ins depend on reliable sustained signal changes, inactivity, cooldowns, user feedback, and Gemini decisions; they are not guaranteed at fixed times. These are prototype product heuristics, not validated stress or focus measurements. Use the Log tab to inspect samples and analysis outcomes.

SQLite is the default session store; Supabase is optional. Backboard remembers bounded work-context excerpts, and real/demo assistant IDs remain local. The Google registry retains item IDs, deck outlines and slide images. See the device guide before migrating data or sharing a database across teammates.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start API on 3001, Vite on 5173, and Electron. Recommended for the complete Google workflow. |
| `npm run dev:server` | API with file watcher, when managing frontend/Electron separately. |
| `npm run dev:web` | Vite only. |
| `npm run dev:electron` | Electron after API/Vite are ready. |
| `npm test` | Automated tests using mocks/synthetic data. |
| `npm run build` | Build frontend into `dist`. |
| `npm run server` | API plus an existing frontend build on port 3001. |
| `npm start` | Build and open Electron with an embedded server; Google OAuth uses its actual loopback port. |
| `npm run demo:data` | Generate a synthetic session export without calling Supabase. |

Stop the old development terminal with Ctrl+C before restarting. Restart everything after `.env` or Electron changes. Reconnect Google after backend restarts. Tests do not verify a new machine's hardware or live provider credentials.

## Project layout

- `src/`: React session UI and companion overlay.
- `electron/`: desktop lifecycle, camera, wake worker and IPC.
- `server/`: API, sessions, analysis, providers, Google actions and image/deck generation.
- `scripts/`: wake installation and optional diagnostics.
- `test/`: automated tests.
- `docs/`: setup and technical guides.

No signed installer or packaging workflow is configured; run from source. Secrets stay in the local backend/main process, not renderer variables. The pretrained openWakeWord models use CC BY-NC-SA 4.0; see the upstream model licensing before commercial distribution.

For macOS source setup, permissions, and the device acceptance checklist, see [macOS setup](docs/MACOS_SETUP.md).

## Session analytics and planner

When a session ends in the app, Jarvis offers an on-screen analytics review. You can also reopen ended sessions from History. Reports show reliable heart-rate, breathing-rate and HRV averages, ranges, trend charts with signal gaps, state durations and check-in counts. Missing HRV stays unavailable.

The Planner tab stores work blocks in the configured database and offers available times within a chosen date/time window, leaving 15 minutes around existing Jarvis plans. Its hourly pattern is the time-weighted share of reliable observations marked elevated relative to each session baseline. An hour needs at least 600 seconds across three sessions on three distinct local dates before it receives a score. Only completed Presage sessions from the latest 100 stored sessions count; demo, break, away, calibration, excluded and unreliable readings do not. A suggested block must have evidence for every minute to receive a ranking. These are prototype signal heuristics, not a validated stress model or guarantee of how someone will feel.

SQLite creates the planner table automatically. Supabase deployments must apply `supabase/migrations/002_planner_records.sql` after migration 001. In Electron, Planner opens a separate resizable window; closing it leaves your session running. You can also type or say “Jarvis, open my planner” or “show my schedule” in chat or the voice panel. Common open requests run locally, without a Gemini call. Connect Google in that window (or reconnect after upgrading) to grant `calendar.events.freebusy`. With Google availability enabled, suggestions check your primary calendar and the Jarvis work sessions calendar, including 15-minute buffers. Other calendars are not checked. Save a block in Jarvis, then click Add to Google Calendar to publish its title and times; biometric data is never included. A stable event ID makes retries safe after uncertain responses. Open linked events in Google to edit them; Google edits are not imported back, and Remove from Jarvis only leaves the Google event intact.

Jarvis can open a website in your default browser from typed or transcribed commands such as “hey Jarvis can you open roblox.com”, “visit github.com”, or “open roblox dot com”. This is a local action and does not require Gemini. Only HTTP/HTTPS addresses are accepted; opening a website does not interact with or sign in to it. Restart Electron after updating to enable the new browser control.

The planner window now centers on a month calendar with previous/next month navigation, Today, selectable days, saved-block markers, and a daily agenda. The side panel finds times for the selected day; signal patterns and connection details are collapsible. The calendar displays Jarvis plans, while Google busy times are used for availability checks when connected.
