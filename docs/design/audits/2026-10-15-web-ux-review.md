# TNND Web — Product Design Expert UX/UI review (2026-10-15)

## Evidence and scope

Primary visual evidence: the six-page desktop browser capture provided by the user
on October 15. The capture shows the existing real Web UI from Overview through
Settings. It is not a post-change screenshot or evidence of mobile/dark mode.

Additional evidence: tracked TypeScript, Neo Bento CSS, current web navigation,
setup/onboarding logic, preference grouping and functional QA scripts.

Never commit the user-provided screenshot, match names, private profile details
or any extracted personal text into the public repository.

## Prioritized findings

| Priority | Observed friction | Treatment |
| --- | --- | --- |
| P1 | All seven work areas displayed one after another in an exceptionally long page | **PR #499:** task-focused seven-section navigation; mounted forms retained; per-section browser QA screenshots |
| P1 | An active five-step tutorial occupies the top of Overview even when the verified setup card reads 100% | **PR #500:** completed setup is compact; checklist/story ideas available on demand; direct links to useful daily work |
| P1 | The full Preferences page intermixes location facts, dating intentions, opt-in multi-bubble replies, match screening and writing details | **This phase:** distinct user-task groups; infrequent and safety-specific groups start collapsed |
| P2 | 'Save preferences' is below a long page and feedback is far from the action | **This phase:** sticky save bar, nearby live success/error announcement, guard against duplicate saves |
| P2 | First-run guide asks the user to paste a latest message though draft generation can use synchronized history | **This phase:** correct text and retain manual override only for testing |
| P2 | Large repeated conversation-management/runner diagnostics compete with the inbox and generated draft | Next: inspect real conversational flow and progressively disclose rare controls |
| P2 | Identity, Personal Memories and Analytics have state density and weak task focus | Next: inspect screenshot matrix and improve each view in isolated PRs |

## Accepted design guardrails

Preserve Neo Bento, real user data, correct verified vs unknown states,
unsaved field values on navigation, account/session isolation, send/consent
gates, and clear distinction between a draft, a send action and confirmed
recipient delivery. No real Tinder sends in visual tests.

## QA evidence and remaining work

- GitHub Actions Web CI, root CI and V1 gate for each merged PR, with PR
  artifacts containing synthetic Chrome screenshot captures.
- Phase 1 synthetic QA captures all seven sections at desktop 1440px and
  mobile 390px. Screenshots still need qualitative human review and broader
  viewports.
- Current screenshot is *before* these changes. Post-change local TNND,
  tablet, dark mode, real extension interaction and live browser QA remain
  unverified in this connected GitHub session.
