# Set up Jarvis on another device

Use this guide for a fresh teammate installation or moving your own setup. Commands are for **Windows PowerShell**, the platform tested for this app. macOS/Linux notes are at the end. No MATLAB, Picovoice account, or Gemini Live setup is needed for the current companion.

## 1. Get the current code and prerequisites

Install Git, Node.js **22.12 or newer** (22.21 is the version used for verification), and Python **3.12** if you want “hey Jarvis.” Python 3.13+ is not supported by the wake installer. You also need a microphone, webcam for real biometrics, and internet access.

Make sure the team has committed and pushed the latest changes first. Cloning does not include somebody else's uncommitted work.

```powershell
git clone https://github.com/ramButTan-hw/Hackrice16.git
cd Hackrice16
node --version
py -3.12 --version
npm ci
```

If the team is using a branch other than the repository default, switch to that branch before `npm ci`. For an existing checkout, save your local changes, pull the team's current branch, and run `npm ci` again. Run all commands below from the folder containing `package.json`.

Do not copy `node_modules`, `dist`, or `data/wake-env` from another machine. Reinstall/rebuild them locally.

## 2. Create the private configuration

Copy the template only if `.env` does not already exist:

```powershell
if (!(Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
notepad .env
```

Fill in credentials in `.env`, never `.env.example`. Never give server keys a `VITE_` prefix. Obtain team credentials through your team's private sharing method; do not commit or paste them into issue reports. Restart the app/backend after editing this file.

| Setting | What it enables |
| --- | --- |
| `GEMINI_API_KEY` | Gemini text replies, screen understanding, check-in decisions, and draft creation. |
| `GEMINI_IMAGE_API_KEY` | Separate image-enabled Google key for standalone images and slide illustrations. Falls back to `GEMINI_API_KEY` if empty. |
| `ELEVENLABS_API_KEY` | Scribe speech transcription after the wake phrase. A voice ID is not needed for spoken input. |
| `PRESAGE_API_KEY` | Real camera biometric measurement; use the Physiology API key. |
| `BACKBOARD_API_KEY` | Optional persistent work memory. Chat works without it. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Desktop OAuth client for Docs, Slides, and Calendar. Separate from Gemini keys. |
| `DATA_PROVIDER` | Leave `sqlite` for the simplest local setup, or configure Supabase below. |
| `WAKE_PYTHON` | Normally leave empty. Never copy another machine's absolute Python path. |

Keep the model defaults in `.env.example` unless your team has selected another supported model. The current defaults are `gemini-3.6-flash` for chat/check-ins and `gemini-2.5-flash-image` for images. Provider availability and quota can differ by project. `GEMINI_LIVE_MODEL`, `ELEVENLABS_VOICE_ID`, and `ELEVENLABS_MODEL` are legacy/optional voice-output settings, not requirements for the current spoken-input/text-reply flow.

Image generation has separate quota: successful text chat does not establish image access. An HTTP 429 with an image limit of **0** requires image-model quota/billing configuration or a different authorized key; repeated retries will not fix it. Shared team keys also share provider limits.

## 3. Pick session storage

**Local installation:** leave these defaults. The backend creates the database automatically.

```dotenv
DATA_PROVIDER=sqlite
DATABASE_PATH=data/companion.sqlite
```

**Shared Supabase installation:** an administrator runs [001_session_records.sql](../supabase/migrations/001_session_records.sql) in the project's SQL Editor once. Set:

```dotenv
DATA_PROVIDER=supabase
SUPABASE_URL=your_project_url
SUPABASE_SECRET_KEY=your_server_secret_or_service_role_key
```

Do not use an anon/publishable key for this backend. This prototype is a single-user installation, not an authenticated multi-user service. Devices sharing the same Supabase project can access the same session records. Use local SQLite or separate projects when teammates need separate histories. Supabase does not automatically transfer the local Backboard assistant IDs or Google deck registry.

## 4. Install “hey Jarvis” locally

```powershell
py -3.12 scripts/setup-wake.py
```

Wait for `Local hey Jarvis detection is ready. Restart the desktop app.` This creates the ignored Python environment and downloads the local model. No wake-word key or company email is needed.

Optional verification:

```powershell
& '.\data\wake-env\Scripts\python.exe' -c "from openwakeword.model import Model; Model(wakeword_models=['hey_jarvis'], inference_framework='onnx'); print('Jarvis model ready')"
```

See [the wake-word guide](WAKE_WORD_SETUP.md) for detailed microphone troubleshooting. Without Python/wake setup, typing and the optional Listen button remain available.

## Local attention tracking

Run this on each device after `npm ci`:

```powershell
npm run setup:attention
```

It downloads the face/phone models and copies the installed MediaPipe runtime into ignored `public/attention-runtime/`. Rebuild after setup if using a built frontend. No attention API key is needed. Do not copy this runtime from a different dependency version; rerun setup after updating dependencies.

During camera monitoring, **Local attention check-ins** is enabled by default. Look at your screen for about 10 seconds to calibrate. Sustained 3D head tilt of about 18 degrees from the calibrated screen position can trigger a neutral check-in after 30 seconds even when the phone is not visible. A visible phone supports a smaller 12-degree tilt. Sideways turns also count. The control displays the measured tilt for calibration. Brief glances reset the timer. After successful calibration, sustained face loss uses a separate 45-second out-of-view check; it does not claim the user is distracted. Missing camera frames still reset the timer. A phone simply sitting in view does not trigger it while your head is facing the calibrated screen position.

The worker samples every two seconds and checks for phones about every six seconds. Camera frames remain local to this detector; only cue states, timestamps and check-in events reach the backend/session database. Presage's own camera processing remains separate. In demo mode the attention camera is real even though biometrics are synthetic. Gemini receives the textual cue as context when answering; it does not repeatedly inspect camera images.

These are head-direction/phone-visibility heuristics, not eye-gaze measurement or proof of distraction. They can miss phones outside the frame or misread typing, reading paper, and a second monitor. Use Recalibrate after changing your normal screen position, or disable attention checks for those tasks. Clear face visibility and adequate lighting are needed. Before calibration, no face is unknown. After calibration, a face out of view can produce a neutral “still there?” check-in after 45 seconds. Pausing the camera pauses attention detection. Closing/stopping the session stops it.

Check-ins respect breaks, existing conversations/check-ins, and a five-minute cooldown. Facing the screen again for 10 seconds rearms detection. Attention cues do not add fatigue points. The neutral opening uses a local template so it still appears without a Gemini review; your response uses the normal voice-input/text-answer flow.

See [Google's face landmark guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) and [object detection guide](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/web_js) for model capabilities.

## 5. Configure Google Workspace

In the Google Cloud project associated with your Desktop OAuth client:

1. Enable **Google Drive API**, **Google Docs API**, **Google Slides API**, and **Google Calendar API**. Slides API is needed to read existing decks for edits.
2. Configure the OAuth consent screen. While in Testing, add **each teammate's Google account** as a test user.
3. Create an OAuth client of type **Desktop app**, or use the team's existing Desktop client with authorization from its owner.
4. Put its client ID and secret in `.env` on this device.

Run the app as shown below, open Jarvis's three-dot menu, select **Connect Google**, and finish browser consent on this device. A Gemini key alone cannot grant access to Google documents.

For this setup, keep the development backend on port **3001**. The OAuth callback is `http://127.0.0.1:3001/oauth/google/callback`. `npm start` uses an embedded server and automatically binds Google OAuth to its actual loopback port. Changing `PORT` alone does not update the Vite proxy and development startup checks.

Google tokens are held in backend memory: reconnect after a backend restart. The app accesses Jarvis-created items and its separate **Jarvis work sessions** calendar, not your entire existing Drive or personal calendar availability. See [Google Workspace setup](GOOGLE_WORKSPACE_SETUP.md) for the preview/confirmation flow and deck-edit limitations.

## 6. Start and verify

```powershell
npm test
npm run build
npm run dev
```

`npm run dev` starts the API on `127.0.0.1:3001`, Vite on `127.0.0.1:5173`, and Electron. Use the **Electron window**, not just the web preview. Keep the terminal open. Tests use mocks/synthetic data; a passing suite does not verify your new device's camera, microphone, account access, or provider quota.

In Windows Settings, allow desktop apps to use the microphone and camera. Select the intended microphone and check hardware mute switches. In the app:

1. Enter a goal and manually start a session. Confirm the camera works for real monitoring, or use **Demo pulse rise** for a labeled synthetic session.
2. Enable the session's “hey Jarvis” option. Say the wake phrase, wait for the chime, ask a question, then pause. Your words should appear, followed by a text answer.
3. Ask a follow-up without repeating the wake phrase. After silence it returns to wake detection. “I'm done” closes help, not the work session. Stop the session manually when finished.
4. Test the features below individually. Live requests consume the corresponding service quota, and confirming Google actions creates/updates actual files or events.

| Feature | Example and expected result |
| --- | --- |
| Screen notes | “Turn this screen into study notes.” A preview reflects the visible page; confirm creates a Doc. |
| Calendar | “Schedule a 30-minute study block tomorrow at 3 PM.” Review date/time/zone, then confirm. |
| Standalone image | “Generate a watercolor image of a cozy study room.” Image appears in chat with Download. Google sign-in is not required. |
| Illustrated Slides | “Make three slides about study habits with illustrations.” Check image previews and the attached-image count before confirming. |
| Deck edit | “Edit my latest presentation: shorten slide 2 and use the blue theme.” Review all slides; confirm updates the same link by replacing deck contents. |
| Memory | Leave work memory enabled, share a harmless preference, then inspect View saved memories. |
| Check-in | Run the labeled pulse-rise demo and watch the Log tab. A review is normally attempted around one minute; real biometric check-ins are not guaranteed on a schedule. |

Screen capture uses the display under your cursor. Keep the relevant material visible. Explicit screen-to-notes/checklist/slide requests capture once even when the general Screen toggle is off; the toggle includes a screenshot with other questions.

## 7. Restarting and updating

Close the main desktop window first: Jarvis saves the active session as ended before camera cleanup and quitting. Camera shutdown is bounded so a stalled SDK cannot leave the session timer active. Minimizing, collapsing, or closing just the companion panel keeps the session active. If saving fails, the app stays open and asks you to retry. Force-killing the process or a power loss cannot run this graceful shutdown. Then stop any remaining development terminal with **Ctrl+C** before starting another copy. After a code update, run `npm ci` if dependencies changed, then `npm run dev`. Restart the whole development process after `.env` or Electron/preload changes. Avoid running a second backend alongside `npm run dev`.

Backend-only development restart command: `npm run dev:server` (use only when your frontend/Electron are being managed separately). Google reconnect is required after the API restarts, including automatic restarts from its file watcher.

## 8. Fresh teammate versus moving your own data

For a **different teammate**, start with a fresh `data/` folder created by the app. They configure their own keys or authorized team keys and sign in to their own Google account. Do not give them your session history or memory identity by default.

For **moving your own installation**, stop both apps before privately copying selected data into the new checkout:

| File | What it preserves |
| --- | --- |
| `data/companion.sqlite` | Local session history when using SQLite. Copy only after the backend has stopped cleanly. |
| `data/backboard-assistants.json` | Backboard real/demo assistant identities; use the same authorized Backboard account/key. |
| `data/google-workspace.json` | Known Google item IDs, deck outlines, retained slide images, and operation history. Sign in to the same Google account. |

The registry is essential for editing earlier Jarvis-created decks on the new machine; Google sign-in alone does not discover them. Never copy the Python virtual environment. Downloaded standalone images are separate files and must be moved separately if wanted. Pending previews, open chat, and OAuth tokens do not transfer. Transfer `.env` privately only if appropriate, and correct any machine-specific paths.

## Troubleshooting

| Symptom | Next step |
| --- | --- |
| Python version error | Use `py -3.12`, not an unqualified newer Python. |
| No wake response | Active session, checkbox enabled, local model installed, correct microphone, desktop microphone permission. |
| Transcription fails | Check ElevenLabs key, Scribe access, quota, and network. |
| Text/image HTTP 429 | Check the relevant key and model quota; the image key is separate. |
| Presage processing/authentication error | Verify the Physiology API key and account credits, then fully restart Electron. The Log tab has diagnostics. |
| Google access blocked | Check Desktop client credentials, test-user list, all four enabled APIs, and granted permissions. |
| Can create Slides but cannot read/edit them | Enable Google Slides API; migrate the registry for earlier decks on your own new device. |
| Images absent from deck | Review the attached-image count before confirmation. Use Add to a slide for standalone chat images. |
| Port already in use / unexpected JSON error | Stop duplicate development processes, then start one `npm run dev`. Verify `http://127.0.0.1:3001/api/health`. |
| Google write is “uncertain” | Check the Google file/event before retrying; the operation may have succeeded. |

For camera startup diagnostics, `node scripts/diagnose-presage.cjs` uses synthetic blank frames and contacts Presage with your configured key. This is a live service probe, not an offline test. Do not publish raw `.env`, database files, screenshots, or credential-bearing logs.

## macOS/Linux and packaging

The wake installer supports `python3.12 scripts/setup-wake.py` and a `data/wake-env/bin/python` environment on Unix. Electron camera/microphone/screen permissions and the native Presage SDK still need verification on those platforms. This guide does not claim end-to-end support outside Windows.

There is no configured signed installer/package workflow. Another device currently runs from source using Node/npm and the setup above.

See [macOS setup and acceptance tests](MACOS_SETUP.md) for the Apple Silicon permission flow.
