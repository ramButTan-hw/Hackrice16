# Independent judging review

Reviewed September 13, 2026 against the restored Jarvis baseline and the subsequent demo-focused changes. Three independent critics examined judging appeal, technical reliability, and demo/UX risks. This is a reasoned assessment, not a ranking prediction: the competing submissions, judges' scores, and presentation quality are unknown.

**Assessment: credible top-10 contender potential, with a conditional case.** The strongest evidence is the engineering connecting sustained signals, contextual assistance, native controls, and saved work. A reliable, focused demonstration is necessary. Breadth alone does not establish a top-10 finish, and no measured productivity or stress-reduction benefit has been shown.

## Actual rubric

The supplied HackRice 16 Hacker Handbook, pages 23–24, lists Technical Rigor; Originality & Creativity; User Experience & Design; Practicality & Impact; and Relevance. It does not provide numerical weights. Live judging gives two minutes for the demo plus one minute for Q&A. The Work & Productivity track emphasizes a real pain point, reduced friction, and continued usefulness after the event.

| Criterion | Critic assessment | What to demonstrate |
| --- | --- | --- |
| Technical rigor | Strongest area | Quality filtering, a personal baseline, sustained observations, bounded native actions, and database persistence. Show why an action happened. |
| Originality | Depends on positioning | Context-aware work support is the promising angle. Voice-based app opening is established precedent. |
| UX/design | Improved, still dependent on rehearsal | Clear source labels, a useful result, visible progress and recoverable failures. Avoid a tour of every window. |
| Practicality/impact | Plausible; unvalidated | A student completes a concrete next step. Be candid that reduced overload/productivity benefit needs a user study. |
| Relevance | Strong for Work & Productivity | Healthy work habits and manageable tasks. Choose the track around the problem, not the number of integrations. |

## Previous award benchmarks

Awards below were verified from the project pages. Performance/impact descriptions are authors' claims rather than independent measurements, and present-day repositories may differ from the judged versions.

| Project | Verified HackRice 15 recognition | Useful lesson |
| --- | --- | --- |
| [Dosed](https://devpost.com/software/health-2b0eay) | Overall first place | A specific prescription-understanding problem makes every feature meaningful. |
| [OwlConnect](https://devpost.com/software/owlconnect) | Overall second place | A concrete student story and explainable matching make the engineering legible. |
| [Agent Evan](https://devpost.com/software/agent-evan) | Lillie Lab AI Challenge | Desktop voice automation is prior art; Jarvis needs a stronger distinguishing story. |
| [CodeScribe](https://devpost.com/software/codex-iqhao5) | Productivity/Education and Warp Developer Tool | One useful action inside an existing workflow can carry a focused demonstration. |

Dosed's [repository](https://github.com/mounikasaka1/hackrice) still describes simulated OCR while its Devpost describes real OCR integration. CodeScribe's linked [repository](https://github.com/justi-lai/CodeArch-Deprecated) now uses the CodeArch name. Do not equate either repository with the exact competition build. The supplied Agent Evan repository could not be fetched during the comparison.

## Changes implemented from the critiques

- Added a read-only demo preflight that separates configuration presence from live service/hardware verification.
- Added an isolated, visibly labeled offline rehearsal and a deterministic local workflow verification command. The rehearsal does not load personal credentials or write to the normal database.
- Added a check-in explanation using captured detector values: source, baseline, recent pulse, threshold, and sustained duration. Missing physiology is not invented.
- Fixed simulated analytics state accounting and legacy missing-state totals.
- Fixed the missing-key local demo fallback while retaining the real-session error and limiting fallback to the explicit synthetic scenario.
- Serialized planner creation so simultaneous overlapping requests cannot both save within the running service.
- Added native Accessibility readiness to the existing permission panel, with no prompt on read.
- Added specific guide progress for preparation, reading, target checks, actions, and result checks; preserved existing action bounds and cancellation.
- Added localized retry behavior for analytics and independent planner/pattern loading.
- Prepared a [two-minute runbook](DEMO_RUNBOOK.md) with an honest fallback and likely Q&A.

## Verification and remaining demo risks

- Full automated suite: 220 tests pass. Frontend production build and changed Electron/script syntax checks pass.
- Local workflow verification passes: synthetic evidence → one labeled local check-in → checklist completion/timer controls → finite report → availability-only saved block → SQLite reopen. It verifies that simulated sessions never qualify as real planner history.
- Native isolated rehearsal: main window opened; typed checklist command created three items; an item was completed; timer opened already running and paused; automatic local check-in appeared; captured evidence displayed; ended-session analytics showed valid charts and missing HRV; the planner saved a block and displayed its calendar marker. These actions used only disposable local data.
- Real Gemini probes using synthetic text succeeded: basic chat in about 1.1 seconds, check-in decision in about 1.5 seconds. These single observations do not establish a latency guarantee.
- Real ElevenLabs transcription recognized generated speech as “Start a one-minute timer”; the normal command parser selected a one-minute timer. This tests the provider and parser, not the microphone, wake detector, room acoustics, or renderer audio capture. An initial empty generated audio fixture was corrected before this passing test.
- Live camera/Presage, actual room voice/wake, Google OAuth/publishing, general guide actions, global Escape, and music playback were not certified by this pass. Complete the relevant manual checks before including them in the ranked demonstration.

The next highest-value work is rehearsal and evidence gathering: record the exact connected workflow, time repeated runs, test Stop/Escape on the presentation machine, and collect real user feedback. Additional features are less likely to improve the judging result than one visibly completed task.
