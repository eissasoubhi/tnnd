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

## Conversation history recovery — subsequent targeted pass

The screenshot shows a selected match with no synchronized messages while the
reply-draft UI remains present. The empty state previously said only that no
messages were synchronized, without explaining how to recover or whether this
could be a new match. The revised copy differentiates a new match from an
already-chatted match, gives safe read-only import instructions, and provides
a Check synced history button. It reuses the existing read-only list/detail
refresh flow without triggering generation, automation or Tinder sends.

## Fifth pass — Personal Memories reliability and recovery
- **P1 source-confirmed:** filter changes formerly updated only the list while leaving a stale selected memory editor, and async fetches could render after account switches. The selected editor now follows visible filtered stories except when the user has unsaved edits, in which case the editor is preserved with a clear notice. A visible Clear filters action restores the full list.
- Requests use a generation + auth-session guard; switching accounts clears private form and review state before reloading. Signed-out and failed loads have explicit nonzero/nonfictional states.
- Added model and integration tests. No memory content, profile details, or screenshot committed; real-account/browser QA remains pending.

## Sixth pass — Identity Builder and Analytics
- **P1, source-confirmed:** Identity Builder and Analytics previously accepted API responses from an account that could have signed out or switched in the meantime. Added per-load request and session-token guards, including late identity analyze/approve results. Identity clears the previous account's private About Me and summary immediately.
- **P2:** Analytics now surfaces four key conversation statuses, with five additional categories available on demand. The snapshot timestamp and non-live nature of stored counts are explicit; a zero attention count is described as a snapshot finding, not a live guarantee. Responsive 4→2→1 column layout follows Neo Bento tokens.
- Web tests verify correct source wiring and states; synthetic CI captures are not a substitute for real-user browser review.
