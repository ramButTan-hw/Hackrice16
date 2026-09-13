# Expression-aware responses

Acumen can optionally use Presage facial-expression estimates to choose a delivery style. An expression classification is not reliable evidence of an internal emotion. The feature changes how Acumen responds when asked; it does not initiate an interruption, record a feeling, score stress, schedule anything, or authorize an action.

## Enable and try it

1. Restart Electron and the backend after updating.
2. Start a real camera session. Expand **Expression-aware responses** beneath the camera controls.
3. Turn on **Adapt Acumen’s tone with facial expressions**. Changing the option restarts camera analysis so the SDK requests the correct metrics. The preference is stored locally and defaults to off.
4. Wait for a reliable cue, then say “hey Jarvis” or choose Ask Acumen. The greeting is on-screen; the listening acknowledgement remains a short chime, not a spoken greeting.

| Cue | Response |
| --- | --- |
| Sustained happy-expression estimate | Lightly upbeat greeting and concise reply style. |
| Sustained angry, fearful, or sad-expression estimate | Gentler greeting, softer/lower listening chime, calm and manageable task help. Acumen does not label the user's emotion. |
| Neutral, surprise, contempt, disgust, unclear, missing, or stale estimate | Normal delivery. |
| User explicitly reports feeling fine | Normal delivery takes priority over a facial cue. |
| User explicitly reports tired/stuck | Gentle delivery takes priority. Current words and explicit style requests take priority in the model prompt. |

## Implementation and limits

The installed SmartSpectra v3 SDK exposes `face.expression` with a stable flag, an epoch-microsecond timestamp, and expression-score percentages. Acumen requests only the additional `EXPRESSIONS` metric (14), rather than the entire face bundle. See [Presage's Node.js metrics guide](https://smartspectra.presagetech.com/docs/nodejs/metrics/).

The local filter requires stable detection, a leading score of at least 75%, at least a 20-point margin, and three distinct observations spanning at least four seconds. A gap over three seconds resets accumulation. Duplicate or out-of-order frames do not add evidence. Cues expire after five seconds and are cleared when monitoring stops. These are conservative product heuristics, not measured accuracy guarantees.

Raw expression distributions are removed from the diagnostic packets that the renderer saves. The in-memory cue contains only a style, source, observation time, and session association. Chat resolves that cue into a fixed delivery instruction before calling Gemini; raw expression scores are not sent to Gemini or Backboard. Existing user text and assistant replies still follow the user's work-memory setting. The camera continues using the existing Presage processing path.

Expression packets are processed independently of heart and breathing packets. Missing or unauthorized expression metrics leave the ordinary vitals flow intact. Presage documents that subscription-restricted metrics can be silently omitted; an empty field does not establish neutral emotion or prove the integration is broken. Simulated and ended sessions cannot supply facial tone cues.

## Verification

Automated tests cover confidence/percentage validation, freshness, sustained observations, duplicate frames, uncertainty, self-report priority, opt-in metric selection, expression packets before vitals, stop/restart cleanup, and removal of raw expression data from saved diagnostics and model requests. The full suite passes (225 tests), and the frontend build passes.

Live camera expression availability and wake audio delivery have not been verified for the current account in this change. Before demonstrating, check the actual on-screen cue status, try wake and click-to-listen, disable the setting to verify normal behavior, and pause/end the session to verify that the cue clears. Do not present a scripted expression or heuristic as proof of emotion-recognition accuracy.
