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


## Timer and checklist widgets

Use the Timer and Checklist buttons on the Session tab, or ask Jarvis in chat/voice:

- “Start a 25-minute timer” / “start a pomodoro”
- “Pause my timer” / “resume the timer” / “reset the timer”
- “Open my checklist”
- “Make a checklist: read notes, practice questions, review mistakes”
- “Make a checklist to prepare for my biology exam” (Gemini generates the steps)

Each widget opens in a separate floating glass window with keep-on-top. The compact timer follows the app theme; the checklist also has theme controls. One saved timer and one checklist are shared across Jarvis windows. Checklists append generated items instead of replacing existing work. Asking Jarvis to open a timer starts it immediately (25 minutes by default), resumes a paused timer, or preserves an already running countdown. The compact window offers custom durations of 1–240 minutes when idle, pause/resume/reset, a 5-minute break after completion, and completion alerts. Breaks start explicitly and do not change the work session or biometric monitoring. Timer deadlines survive closing the widget and restarting Jarvis; alerts require the app to be running (an overdue timer is recognized on restart). Closing a widget preserves its state.

SQLite creates widget storage automatically. Supabase users must apply `supabase/migrations/003_widget_records.sql`. Restart Electron after updating to load widget controls.

## Screen guidance and supervised input

In Chat, choose **Guide me**, or say “Jarvis, guide me through finding my assignment.” Review the task in the separate guide window and click **Show next step**. Each requested step shares a fresh screenshot of the display where guidance opened with the configured Gemini model. These screenshots are not saved to the database or memory. Jarvis temporarily hides its other windows so they do not cover the task, and restores them when guidance stops.

A visible cursor ring marks the suggested control. Follow the instruction yourself and choose **I did it · Next**, or approve **Do this step** to perform exactly one click, short text insertion, or scroll. Text is shown verbatim before approval and is inserted at the clicked field's caret (it does not clear existing text). By default, **Check result · Next** reads the screen again. Explicit **Do it for me** mode can perform up to eight steps with fresh screen checks. Sensitive steps and final submissions are handed back to the user. Screenshot interpretation can be imperfect: inspect the highlighted target before approving.

**Stop** or **Escape** dismisses the guide and cancels pending work. Approvals are single use, expire after 30 seconds from screen capture, and are rejected if the target pixels, display geometry, or active app change. A step that fails must be refreshed before another approval. The overlay works without input permissions; supervised input currently requires macOS Accessibility permission for Jarvis/Electron. Use **Enable macOS Accessibility** in the guide, return to the target app, then request a fresh step. Ordinary text fields are verified through Accessibility; secure fields and terminal/System Settings input are refused.

Source launches compile the bundled Swift input helper on first use into the app's user-data directory. Apple Command Line Tools are required (`xcode-select --install`); if they are unavailable, manual guidance remains available. Restart Electron after updating. Screen guidance uses `GEMINI_API_KEY` and `GEMINI_MODEL`, like chat.

### Voice in the guide

Click **Voice on** once in the guide, or open guidance by speaking to Jarvis to carry voice into the guide automatically. With microphone access and `ELEVENLABS_API_KEY` configured, the guide continues listening between commands even while you use another app. Say **“let’s start”** to begin the entered task and **“I did it”**, **“next step”**, or **“continue”** to capture the screen and suggest the next step. If you have not entered a task, say **“my task is …”** first. **“Pause listening”** turns off the microphone; **“stop the guide”** closes guidance. Stop / Escape remains immediate while speech is being transcribed.

Silence is not uploaded. Spoken utterances are sent to the existing ElevenLabs transcription service, so voice commands take a moment to process. Late transcripts from an earlier step are discarded. “Do this step” approves one displayed action and checks the result. “Do it for me” enables bounded takeover. Other voice commands do not approve input.

### Opening websites and Mac apps

Chat and guide voice both understand **“open Google”** (the website), **“open Google Docs”**, **“open Safari”**, **“open Chrome”**, and **“open Spotify”**. App launching resolves installed `.app` bundles in `/Applications`, `/System/Applications`, their immediate subfolders, and `~/Applications`, with a Finder shortcut. Missing apps produce a specific error. Names are passed as literal launch arguments, never shell commands.

A direct spoken request to open a target launches it immediately. If the guide proposes opening a website or app as its next step, review it and click **Do this step**. Opening a target does not require Accessibility permission. Guidance retains the original task and up to four recent suggestions, then checks a fresh screenshot before deciding what comes next. It is instructed to navigate to the relevant service and perform the task, rather than search for how-to instructions unless requested.

### Do it for me

After starting guidance, click **Do it for me** or say the same phrase with voice enabled. Jarvis previews each action for one second, performs it, and takes a fresh screenshot before choosing another step. It pauses at manual/sensitive steps, permission or action errors, repeated suggestions, or after eight actions. **Stop / Escape** cancels pending work; voice remains available for **“stop the guide”** while takeover runs. Already dispatched input cannot be undone by Stop. Say **“do this step”** to perform just the displayed action and inspect the result. macOS Accessibility permission is needed for clicks, typing, and scrolling.

Guide voice also accepts free-form answers, corrections, and questions. For example, after a clarification question, say “the second option” or “I want to add a README.” The guide sends the recent question/reply context (up to six entries) with a fresh screenshot, and displays the recognized reply. These replies request a new suggestion; they do not implicitly approve an action or start takeover. Say “my task is …” to replace an active task without reopening the guide. During active takeover, stop the guide before changing direction.

### YouTube Music first playlist

Say **“Hey Jarvis, open YouTube Music and play my first playlist.”** Jarvis opens YouTube Music in your normal browser and starts its bounded guide takeover automatically. It selects the first saved/user playlist displayed in Library → Playlists and starts playback; it pauses for sign-in, unavailable playlists, or unclear progress. Your browser's existing account is used, without copying cookies into Jarvis. Accessibility and screen access are required for the guide. The browser is brought forward during selection; playback can continue in the background afterward. This is screen-guided playback, not a background browser extension or an official YouTube Music API integration. Actual audio output is not verified by screenshots. Stop/Escape cancels guide input; use the music player's Pause control to stop audio already playing.
