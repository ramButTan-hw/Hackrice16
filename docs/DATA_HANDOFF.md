# Database, analytics, and state engine — morning handoff

## What works now

Start `npm run dev:server`. SQLite is created at `data/companion.sqlite` and survives restarts. No keys required. Run `npm test` and `npm run demo:data` to exercise the complete data loop. The demo creates a separate database and export files under `artifacts/`; it never connects to Supabase.

The React starter remains available for your UI teammate. This change implements backend contracts, not camera/AI/voice integrations or a new UI.

## Your first morning checkpoint

1. All teammates run `npm ci`, `npm test`, and `npm run dev:server`.
2. UI owner starts a session and retains the returned ID.
3. Presage owner posts real numeric samples using the exact contract below.
4. AI owner reads `workState.shouldIntervene`, gets Gemini text, logs the intervention, and speaks it through ElevenLabs.
5. End the session, retrieve the summary, and export the session JSON for MATLAB.

First prove this loop together before adding widgets. Each teammate should own their integration files and avoid changing shared field names without coordinating.

## API contract v1

Base URL in standalone development: `http://127.0.0.1:3001/api`. React uses relative `/api` through Vite. All bodies and responses are JSON. Errors are `{ "error": "message" }` with a non-2xx status.

| Method | Path | Body / result |
| --- | --- | --- |
| POST | `/sessions` | `{ "goal": "Read chapter 4", "source": "demo" }` → session with `id` |
| GET | `/sessions` | Latest 100 session headers |
| GET | `/sessions/:id` | Full session aggregate, suitable for export |
| POST | `/sessions/:id/metrics` | MetricSample below → `{ sample, workState, revision }` |
| GET | `/sessions/:id/state` | Current state, reason, baseline, shouldIntervene, sessionStatus |
| POST | `/sessions/:id/interventions` | `{ "provider": "gemini", "text": "Would you like a break?" }` → updated session |
| POST | `/sessions/:id/end` | No body required → completed session |
| GET | `/sessions/:id/summary` | Duration, averages, state seconds, before/after differences |

MetricSample (timestamps must be fresh, strictly increasing, and after session start):

```json
{
  "timestamp": 1789194000000,
  "source": "presage",
  "heartRate": 72,
  "breathingRate": 14,
  "hrv": null,
  "quality": 0.95,
  "idleSeconds": 0,
  "onBreak": false
}
```

Replace the example timestamp with `Date.now()`. Units: bpm, breaths/minute, HRV milliseconds, idle seconds. HRV is optional: leave it null unless the SDK provides the agreed measurement. The Presage owner must map the SDK's signal validity to quality (0–1); do not fabricate confidence. Real samples require a session created with `source: "presage"`. Demo samples are explicitly labeled and never mixed with real samples. Send roughly one sample every two seconds. The cap is 3600 samples/session.

`shouldIntervene` is a suggestion, not an executed action. The AI owner should allow only one in-flight intervention per session. Log the generated message before speaking it; a second log within 60 seconds returns 429. The backend doesn't call Gemini or ElevenLabs. For a 409 revision conflict, reload and retry an uncommitted operation; for a timeout, check current session data before retrying to avoid duplicates.

## State engine

States: `unknown`, `calibrating`, `steady`, `elevated`, `away`, `break`. Initial baseline requires 20 seconds of continuous reliable data and at least five samples. Quality must be >=0.7. Gaps over ten seconds interrupt calibration. The baseline is frozen once established and persists across restarts.

Both HR and breathing must stay >20% above baseline for >=6 seconds and >=3 samples to trigger elevated. Missing/poor-quality data produces unknown; explicit break produces break; reported inactivity >=120 seconds produces away. Silence for >10 seconds produces unknown. These are prototype signal rules, not validated focus, stress, or fatigue measurements. Thresholds live in `shared/contracts.js`.

Summaries exclude poor-quality readings from averages, account for signal gaps as unknown time, and report null for unavailable averages. Before/after HR differences require three usable samples on each side and a complete 30-second follow-up window. They are not causal effectiveness scores.

## Database setup

Local default: SQLite, no setup required. Session aggregates include samples, baseline, and interventions. Each write updates one revisioned row atomically. This keeps all teammates on one contract while fields are evolving. It is a bounded hackathon implementation; normalize sample rows for high-volume ingestion and large histories.

For Supabase:

1. Create or select the team's development Supabase project.
2. Run `supabase/migrations/001_session_records.sql` in its SQL Editor.
3. Copy `.env.example` to `.env` locally; set `DATA_PROVIDER=supabase`, the project URL, and `SUPABASE_SECRET_KEY` (new secret key or legacy service-role key).
4. Restart the Node server; `/api/health` should show `storage: "supabase"`.
5. Start, end, and retrieve a test session to verify cloud writes. Local data is not automatically migrated.

Do not paste keys into chat, commit `.env`, or prefix the secret with `VITE_`. The migration enables RLS and gives no anon/authenticated access; only the trusted backend uses the secret. This API is for one user's loopback development environment, not a public multi-user deployment. Do not distribute an Electron build containing the team secret; multi-user production needs a hosted authenticated backend and per-user policies.

## MathWorks

MATLAB R2026a is installed and licensed at `C:/Program Files/MATLAB/R2026a`. Batch execution was verified on September 12, 2026: report and chart generation succeeded, and all three averages and sample counts matched the JavaScript summary. Generate a fixture with `npm run demo:data`, then from the repository root run:

```powershell
& "C:/Program Files/MATLAB/R2026a/bin/matlab.exe" -batch "addpath('analytics'); analyzeSession('artifacts/demo-session.json','artifacts/matlab-report.json')"
```

This creates a MATLAB-computed report plus a two-panel PNG chart beside it. The JSON averages can be compared against `artifacts/demo-summary.json`. No special toolbox is required. Continuous sessions now use server/matlab.js to keep one MATLAB process alive and analytics/analyzeWindow.m to compute rolling features every ten seconds. server/monitor.js sends compact MATLAB, Presage and activity snapshots to Gemini automatically, with six attempts per session and separate intervention cooldowns. The original exported-file report remains available.

## What we need from you

- Supabase is configured locally as `https://oraqtqewohlgjkgzzssf.supabase.co` with DATA_PROVIDER=supabase. The migration and credentials were verified through a complete create/metric/end/read/summary check on September 12, 2026. The retained test session is labeled `Integration verification (synthetic data)` with source `demo`.
- MATLAB R2026a analysis is verified. Teammates need their own activated MATLAB installation and local server configuration; secrets are not committed.
- From the Presage owner: actual metric availability, units, validity signal, and sample cadence. Current ingestion rules are the starting agreement.
- Assign the UI, Presage, and Gemini/ElevenLabs owners; share this document and the branch with them.

Official references: [Node SQLite](https://nodejs.org/api/sqlite.html), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [MATLAB JSON](https://www.mathworks.com/help/matlab/json-format.html).
