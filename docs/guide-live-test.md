# Jarvis guide live test — September 13, 2026

Latest result: PASS for the targeted Google Docs word-selection and red-text workflow. This does not certify arbitrary desktop tasks or live voice.

## Retest after targeting fixes

- Added local Vision OCR grounding for double-click word selection. Missing or ambiguous words stop input instead of falling back to model coordinates.
- Named click targets use macOS Accessibility positions when available. Candidate controls are hit-tested for visibility and duplicate nodes at the same location are merged.
- Added a structured action response schema and a verification-only completion check for repeated suggestions.
- Increased capture resolution to preserve small text.
- Live outcome: Jarvis selected Animals and changed it to red while the remaining sentence stayed black. A subsequent screenshot independently confirmed the result. Jarvis ended with “Task looks complete” / “The word Animals is now red.”
- Stop closed the guide and restored the session window.
- 203 automated tests passed; frontend build and native Swift compilation passed.
- The disposable test process was cleaned up. Electron Accessibility remains enabled as approved by the user.
- Live speech was not retested. A background tool-generated Escape key did not close the guide, so the global Escape path remains unverified live. Exact marker rendering was not independently measured.

## Initial failed run (before fixes)

The original observations below are retained as failure history.

## Environment

- Real workspace Electron application on macOS; real Swift/CoreGraphics input helper.
- Disposable SQLite database and Electron profile under `/tmp/jarvis-guide-live*`.
- Disposable Google Doc containing “Animals live in many habitats.”
- Task: change only “Animals” to red text.
- User approved sending test display screenshots to Gemini and enabling Electron Accessibility access.

## Observations

| Check | Result | Evidence |
| --- | --- | --- |
| Automated suite | PASS | 197 tests passed, zero failures. These include mocked guide/input tests, not native end-to-end proof. |
| Real guide opens | PASS | Opened through Chat → Guide me in Electron. |
| Screenshot/model request | PASS | Gemini returned instructions based on the current desktop, including an overlapping window and browser tabs. |
| Native input permission | Initially blocked; resolved locally | Electron was absent from macOS Accessibility. Added the workspace Electron.app with user approval; settings showed it enabled and the guide exposed Do this step. |
| Native mouse delivery | PASS, limited | Jarvis's click collapsed a Chrome tab group. Input is reaching Chrome, but the selected target was wrong. |
| Word selection | FAIL | After a proposed double-click on Animals, Google Docs entered header editing instead of selecting the word. Reloading verified the original sentence was intact. |
| Text formatting | NOT PASSED | The requested red text was not produced. |
| Repeated-action guard | PASS live | Takeover paused when the same tab-group action was proposed again. |
| Cursor marker placement | NOT VERIFIED | The guide generated coordinate-bearing targets, but accurate visible marker placement on Animals was not established. |
| Stop button | PASS live | Stopped the guide and returned to the session window. |
| Escape during native action | Automated coverage only | Not verified live in this run. |
| Spoken commands/microphone | Automated coverage only | Not tested with live speech. |

## Issues observed before the targeting fixes

1. Targeting failed in the initial run: the model chose a Chrome tab-group label instead of the document tab, and word selection landed in the header. The retest above passed the specific Animals-to-red workflow after OCR and Accessibility grounding were added. That result does not establish reliability for arbitrary desktop tasks.
2. The initial guide used a generic “Looking at your screen” status that hid native-helper initialization and model latency. The current code reports preparation, screen reading, step selection, target location, input, and result-checking phases. These new progress messages have automated coverage; they have not yet been verified in a live provider run.
3. Graceful termination of isolated test processes left blank windows after their local servers stopped. Force-stopping only those disposable test instances restored a clean launch.

Do not describe unit tests or helper compilation as proof of successful native formatting. The targeted live retest above supplies separate evidence for that workflow. Before a release or demonstration, repeat it without manual correction, verify the selected word and final red text, and check marker visibility, Stop/Escape, and live voice separately. Global Escape and live speech remain unverified by this report.
