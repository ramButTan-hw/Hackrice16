# Jarvis: judging demo runbook

Lead with one useful outcome: **Jarvis helps a student move from a difficult work moment to a concrete next step, and saves the session for reflection and planning.** Optional physiological signals invite a conversation; they do not diagnose stress or decide how the student feels.

The supplied HackRice 16 Hacker Handbook (pages 23–24) specifies a two-minute live demonstration followed by one minute of questions, repeated for different judges. It also requires a 3–4 minute submission video and allows at most one track, with multiple challenges. Work & Productivity is the strongest fit. Confirm any organizer updates before submitting.

## Before presenting

```sh
npm run demo:check
npm test
npm run build
npm run demo:verify
```

`demo:check` checks local files and configuration without contacting providers, changing permissions, or printing credentials. A configured key is not a working service. Resolve hard failures and complete the manual checks it lists in the exact app/profile used for judging.

`demo:verify` exercises the real local services using a virtual clock and disposable SQLite storage: synthetic samples → one local check-in → checklist/timer → report → available work block → database reopen. It makes no cloud calls and deletes its temporary database afterward. It does not test devices or native input.

For a repeatable offline practice run:

```sh
npm run demo:rehearse
```

This builds and opens a fresh, isolated Electron profile and SQLite database each time. It skips `.env`, clears provider credentials in the child process, turns off camera/voice, and visibly labels the rehearsal. Your normal data and credentials remain unchanged. Temporary rehearsal files remain at the path printed by the launcher for inspection. Close the rehearsal normally before opening the regular app.

In rehearsal, click Start session or Start rehearsal. The task is prefilled. Local synthetic readings form a 20-second baseline; a sustained rise generates one **local example** check-in around 60–80 seconds. It is not an AI response. Timer, checklist, history, reports, and availability-only planning use the normal implementation. Cloud AI, Google, screen guidance, and voice are unavailable in this mode.

For the actual connected demonstration, use `npm start` or your rehearsed development setup. Reconnect Google after the final backend restart. The existing Demo pulse rise button labels synthetic biometrics but can use real Gemini; Gemini can decide not to interrupt. A failed request can produce a labeled local fallback. Never promise a check-in at an exact time or present a fallback as AI output.

## Two-minute sequence

Use the same task throughout: **Prepare for my biology exam.** Start the labeled signal demonstration early and confirm its check-in is ready before starting the presentation clock. Baseline collection must not consume the pitch. In a connected run, if Gemini chooses not to interrupt, use Ask Jarvis manually and identify the saved example separately. Keep a completed example report ready in History.

| Time | Show | Say or do |
| --- | --- | --- |
| 0:00–0:15 | Current task and clearly visible source label | “When studying gets difficult, I need help taking the next step. Jarvis combines my current task, optional signal trends, and my own feedback to offer help.” |
| 0:15–0:35 | Check-in and **Why Jarvis checked in** | Show the actual baseline, recent pulse and sustained duration. “This is an invitation to check in. It does not tell me I am stressed.” For the offline run, explicitly identify the local example response. |
| 0:35–1:05 | Saved checklist and timer | Type “Make a checklist: review cells, practice five questions, review mistakes”. Tick one item. Then “Start a 1-minute timer”. The window opens already counting down. In a verified connected run, optionally use AI to generate the checklist from the task instead. |
| 1:05–1:30 | End session → Show analytics | Show the saved chart, unavailable HRV, check-in evidence, and honest state totals. “The record survives the session. It gives context for reflection.” |
| 1:30–1:55 | Planner calendar | Find a future time, save “Biology: review mistakes”, and show its marker/agenda entry. Fresh or simulated history must say **Availability only**. |
| 1:55–2:00 | Completed result | “I have a next step, time set aside for it, and a record I can return to.” |

Close each widget after showing it so the next window is visible. Keep typed commands ready for a noisy room. Rehearse this exact sequence three times with a stopwatch; automated checks are not a substitute for those human rehearsals.

## If something takes too long

- **No check-in yet:** open Ask Jarvis manually and explain that a check-in is optional. Show the saved, clearly labeled example later. Do not restart every service in front of the judge.
- **Network/AI delay:** after roughly ten seconds, switch to the explicit local checklist command and timer. Identify the fallback. Keep a clearly identified short recording of the connected workflow for the required video or follow-up questions.
- **Voice fails:** click the text field and type the same command. This proves task execution while avoiding a microphone debugging session.
- **Google needs sign-in:** save locally and show the calendar block. Do not spend the two-minute pitch on OAuth.
- **Guidance pauses:** explain the reason, use Stop, and continue with the saved result. Do not repeatedly approve a target you cannot verify.

## Optional connected proof

Only include these after repeated successful checks on the presentation machine:

- A real spoken command reaches the intended timer/checklist action. Test wake phrase and click-to-listen separately in realistic noise.
- A generated Google preview saves once and Open in Google reaches the correct item. Use a disposable demonstration document and verify it after the final restart.
- The prepared Google Docs “Animals → red” task completes through Jarvis, with the selected word and final color visible. Separately verify Stop and Escape. Existing targeted evidence is in [guide-live-test.md](guide-live-test.md); it is not certification of arbitrary desktop control.

Keep music playback and arbitrary app automation out of the main pitch. They add account/layout variability and contribute less to the distinctive work-support story.

## Answers to likely questions

**Why is this useful beyond a chatbot?**
The current task, sustained signal checks, explicit user feedback, practical tools, and saved history sit in one workflow. Demonstrate the transition to an actual saved next step rather than listing APIs.

**Does a higher pulse mean stress?**
No. Movement, excitement and many other causes can change it. Jarvis requires fresh, sufficiently reliable observations and uses a sustained rise relative to a personal baseline only to invite a check-in. The user supplies the context. Steady/elevated report states combine heart and breathing signals; a pulse-only rise can still trigger the separate check-in heuristic.

**Does it improve productivity or reduce stress?**
That has not been established. The prototype demonstrates execution and persistence. The next evaluation should measure completed tasks, unwanted interruptions, and user-reported helpfulness with real participants; do not invent a success percentage.

**Why does the planner need more history?**
An hour needs 600 reliable observed seconds across three completed real sessions on three distinct dates to receive a ranking. Demo data does not count. A proposed block needs evidence for every minute; otherwise it is offered by availability only. The score describes past elevated-signal time, not future stress probability.

**What leaves the device?**
Local wake detection and attention inference run locally. Presage supports biometric processing; speech goes to ElevenLabs, requested screenshots/text can go to Gemini, and work memory can go to Backboard when configured and Remember work context is enabled (enabled by default). Storage can be local SQLite or configured Supabase. Google receives only approved artifacts and calendar fields. Be specific about the configuration you demonstrate; do not claim the entire connected app is offline.

## Submission video

Prepare a 3–4 minute video, separate from the two-minute live script: about 30 seconds for the problem/team/track, two minutes for the workflow, 30 seconds for the architecture, and 30 seconds for impact and limitations. Keep source labels readable. Use a quiet recording and a clean demonstration document. Explicitly label recordings, synthetic signals, and local fallbacks. Do not claim biometric validation or general-purpose takeover reliability.
