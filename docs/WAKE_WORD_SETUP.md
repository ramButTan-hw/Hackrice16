# Enable “hey Jarvis” on your computer

This guide is for teammates running the desktop app from this repository. Windows/PowerShell instructions are below. **Each teammate must run the installer on their own machine:** the Python environment and downloaded wake model live in the ignored `data/` folder, so pulling the repository does not install them.

## 1. Prepare the project

Open a terminal in the project folder—the folder containing `package.json`. Use the latest team code, including `scripts/setup-wake.py` and `scripts/wake-worker.py`.

You need:

- Node.js **22.12 or newer**, as specified in `package.json`.
- Python **3.10, 3.11, or 3.12**. The setup script rejects Python 3.13 and newer. Use Python 3.12 for the commands below.
- A working microphone and internet access for installation and AI requests.

Check your versions and install the JavaScript dependencies:

```powershell
node --version
py -3.12 --version
npm install
```

If `py -3.12` is unavailable, install Python 3.12 or use the full path to an existing supported Python executable. For example:

```powershell
& 'C:\path\to\Python312\python.exe' scripts/setup-wake.py
```

## 2. Install the local wake detector

From the project folder, run:

```powershell
py -3.12 scripts/setup-wake.py
```

The installer creates `data/wake-env`, installs `openwakeword==0.6.0`, downloads the `hey_jarvis` model, and checks that the model loads.

Wait until you see:

```text
Local hey Jarvis detection is ready. Restart the desktop app.
```

**No Picovoice account, company email, or wake-word API key is needed.** You do not need to activate the Python environment manually; Electron starts its Python executable directly.

## 3. Configure the AI services

If you do not already have `.env`, copy the example once:

```powershell
if (!(Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
```

Put your credentials in **`.env`**, not `.env.example`. Keep `.env` private.

```dotenv
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3.6-flash
ELEVENLABS_API_KEY=your_elevenlabs_key
BACKBOARD_API_KEY=your_backboard_key
```

- **Wake detection:** local; no API key required.
- **ElevenLabs:** transcribes your question after the wake phrase.
- **Gemini:** generates the text answer.
- **Backboard:** remembers work context; optional for asking questions.

Leave `WAKE_PYTHON` empty unless you intentionally use a different environment. A custom value must point to a Python executable with openWakeWord and the downloaded model installed. Do not copy another teammate’s absolute path.

Keep your existing database and Presage configuration. A Presage key is needed for real camera biometrics; wake detection itself does not depend on it.

## 4. Restart and enable it

Close the desktop app. Stop any previous `npm run dev` terminal with **Ctrl+C**, then run:

```powershell
npm run dev
```

This starts the backend, web development server, and Electron. Open the **desktop window**, not just the browser preview.

1. Enter a goal and manually start a session. A demo session works too.
2. Find **Enable “hey Jarvis” during sessions** and make sure it is checked.
3. Wait for **Listening locally for “hey Jarvis”**.
4. Say **“hey Jarvis.”** Wait for the chime before asking your question.
5. Say something like **“Help me choose the first step for this task.”**
6. Pause for about **1.4 seconds**. The app transcribes your question and displays the answer.

After an answer, the app briefly listens for another question without requiring the wake phrase. After roughly **12 seconds without speech**, it returns to local wake detection. Say **“not now”** or **“I’m done”** to close the conversation; this does not end your work session.

**Screen sharing is optional:** turn on **Screen** in the overlay if you want Jarvis to see a screenshot with your question. It is off by default.

## 5. Troubleshooting

| What happens | What to check |
| --- | --- |
| “Please run this script with Python 3.10, 3.11, or 3.12” | Run `py -3.12 scripts/setup-wake.py` instead of an unqualified `python` command. |
| Setup fails during installation or model download | Check the connection and the first error in the terminal, then rerun the installer. Keep the error text if you need help. |
| The app asks you to run wake setup | Confirm `data/wake-env/Scripts/python.exe` exists. Check for an incorrect `WAKE_PYTHON` override in `.env`, then restart Electron. |
| Wake model startup fails | Run the model check below. A Python executable alone does not mean the packages and model are installed. |
| No response to “hey Jarvis” | Confirm the session is active and the checkbox is enabled. Check your selected Windows input microphone, hardware mute switch, and microphone access for desktop apps in Windows Settings. |
| The overlay opens, but the question is not recognized | Wait for the chime, speak clearly, then pause. Check the selected microphone. |
| Your words appear, but no answer arrives | Wake detection and transcription worked. Check the displayed Gemini error; this is a separate API/model/quota issue. |
| An ElevenLabs error appears | Check `ELEVENLABS_API_KEY` and its transcription access/quota, then restart the backend after changing credentials. |
| Jarvis cannot see your page | Enable **Screen** before asking. Screen sharing is separate from the microphone. |
| Port 3001 or 5173 is already in use | Stop the previous app development terminals before starting another `npm run dev`. |

Check the installed model directly from PowerShell:

```powershell
& '.\data\wake-env\Scripts\python.exe' -c "from openwakeword.model import Model; Model(wakeword_models=['hey_jarvis'], inference_framework='onnx'); print('Jarvis model ready')"
```

If wake detection is unavailable, **Ctrl+Shift+Space** or **Open companion** opens help during an active session. The optional **Listen** button starts a question without holding it down; typing also works.

## Microphone behavior

While waiting for “hey Jarvis,” microphone audio is processed locally. Once activated, the captured question is sent to ElevenLabs, and its transcription goes to Gemini. The app does not save raw recordings or screenshots to disk. Stop the session to stop its wake listener, or uncheck the wake-word option; if a conversation is already listening, pause or close that conversation too.

## macOS / Linux teammates

The installer also selects a Unix virtual environment layout. With a supported Python installed, use:

```bash
python3.12 scripts/setup-wake.py
./data/wake-env/bin/python -c "from openwakeword.model import Model; Model(wakeword_models=['hey_jarvis'], inference_framework='onnx'); print('Jarvis model ready')"
npm run dev
```

The desktop workflow has been verified on Windows; macOS/Linux microphone, screen permissions, and the rest of the app need testing on those platforms.
