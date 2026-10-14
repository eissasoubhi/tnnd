# TNND web app UX — review guide

## Navigation and task structure
- Keep the **section-first** workspace as documented in `docs/design/neo-bento.md`: Overview, Conversations, Identity, Memories, Action Center, Analytics, Settings.
- Overview should prioritize actual status, onboarding and next steps; avoid duplicating analytics and repeating large settings forms.
- Conversations should prioritize identification of the match, latest verified message, readable inbox state and explicit drafting/review controls.
- Identity Builder and Personal Memories are task-focused editors, with saved/draft/approved distinctions and useful persistence feedback.
- Action Center surfaces actions requiring human judgment, without inventing completion.
- Settings groups baseline style, AI provider, account, privacy, backup/import by user intent rather than technical subsystem.

## Density, responsive and keyboard
- Preserve mounted forms and unsaved input when switching workspace sections; preserve stable anchors/deep links.
- Follow Neo Bento responsive breakpoints from actual CSS/design docs; inspect desktop, narrow tablet and phone, light/dark.
- Make first viewport scannable and primary task discoverable. Avoid horizontal overflow and giant blank columns beside long editors.
- Use semantic landmarks, linked field labels, keyboard controls, visible focus and truthful disabled/async feedback.
- Forms: inline validation, field guidance, stable values, retry and safe re-submission. Filters: reversible, clear active state.
- Avoid accidental PII display and optimistic claims before server confirmation.

## Verification
- Existing web commands: from `apps/web` run `npm run typecheck`, `npm test` and `npm run build`.
- Root CI runs browser functional QA in `scripts/functional-qa-web.mjs` with synthetic same-origin API. This is not a live Tinder acceptance test.
- Inspect affected screens and real content states in browser whenever possible; record any untested states.
