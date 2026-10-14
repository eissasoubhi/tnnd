# TNND — Product Design Profile

**Scope:** TNND web application + browser extension (popup, options, preview, injected controls).
**Approved visual identity:** Neo Bento. See `docs/design/neo-bento.md` and the project Figma file linked there.
**This profile is design guidance, not evidence of release readiness.**

## Product and users

TNND helps users configure an AI-assisted conversational identity, review personal memories, manage conversations, inspect suggested drafts and retain control over real sending actions. It must communicate limits and uncertainty rather than promising that external Tinder actions happened.

Primary jobs:
1. Configure and understand Identity Builder, personal details and language/tone preferences.
2. Add/review real Personal Memories while preserving privacy and approval.
3. Find conversations, see meaningful match identity/recent verified activity and prepare/review replies.
4. Understand connection, automation, permissions and tasks requiring human action.

Do not frame private profile/match facts as AI-generated truths.

## Visual system — immutable without explicit redesign scope

- Direction: expressive organization, calm interaction, professional, modern and human-centered.
- Theme: forest green foundation, mint for active/positive, lilac for identity/memory review, peach for attention; always pair color with labels/meaning.
- Sources: `apps/web/src/neo-bento.css` for web, `public/neo-bento.css` for extension, `docs/design/neo-bento.md` for design rules, existing Figma foundations.
- Typography: DM Sans with Inter/system fallbacks; do not fetch remote fonts in production just for cosmetics.
- Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48px; control radii 10px, tiles 18px, panels 24px as documented.
- Accessibility: 44x44 targets, clear focus-visible, meaningful error states, reduced motion, responsive and WCAG 2.2 AA aspiration.

## Information architecture and hierarchy

Web workspace is **section-first**: Overview, Conversations, Identity, Memories, Action Center, Analytics, Settings. Do not change to a mega long-scroll experience or reset mounted form content during navigation.

- **Overview:** real health/status, setup checklist and relevant next action.
- **Conversations:** readable list, stable match identity, verified latest message, context, explicit draft/review actions.
- **Identity:** real editable identity details and writing preferences; explain saved vs awaiting review.
- **Memories:** user-provided anecdotes and provenance, privacy, explicit approval; no synthetic memories.
- **Action Center:** pending user decisions and manual takeover, not claimed automated completions.
- **Analytics:** verified data only; show unknown/unavailable rather than invented zero.
- **Settings:** clear groups for global preferences, AI provider, account, sync, import/export and privacy.

## Web vs extension

- Web is the full product workspace. Source code mainly in `apps/web/src`.
- Extension popup is a compact high-priority status/task UI, not full dashboard. Source code: `public/popup.html`, `src/popup.ts`.
- Options is for durable configuration; preview is for safe simulation, never live send.
- Injected UI on Tinder must not block native clicks, keyboard, focus, scrolling or unexpected user actions.
- Both surfaces share words and state meanings, not page structure.

## Terminology and AI honesty

- Identity Builder, Personal Memories, Conversations, Action Center, Suggested reply, Draft, Send confirmation, Action required.
- Keep language consistent with current interface locale; don't invent unsupported localization.
- Differentiate suggested/draft/reviewed/approved/sending/confirmed sent/failed.
- A live send is confirmed only with reliable external evidence. Never say "sent" based solely on generation or queued action.
- Daily opener message limits must clearly explain real scope/reset/count **after checking enforcement code**; avoid misleading per-chat vs per-day labels.
- Don't demand manual last-message input when reliable synchronized data is available; if it is not, explain why and offer recovery rather than a dead end.

## Technical and release safeguards

- Preserve product data, authentication, privacy, conversation identity, consent, automation controls and Tinder integration gates.
- Don't invent Tinder selectors or weaken send/manual intervention guards.
- Use `docs/v1-release-checklist.md` to understand release blockers. A mock browser check does not prove real Tinder sending.
- Existing tests: `npm run build` (root), `npm run test:extension-neo-bento`; in `apps/web`: `npm run typecheck`, `npm test`, `npm run build`.
- Existing CI runs `scripts/visual-qa-extension.mjs` and `scripts/functional-qa-web.mjs`. Inspect screenshots and failing results before claiming visual QA.
- Review Neo Bento web desktop/tablet/phone and extension popup/options/preview separately.

## Review rule

All significant UI PRs should describe the user task improved, page hierarchy, copy changes, affected states, accessibility and responsive impact, tests actually executed, manual checks pending. Use the checklist in the Product Design Expert Skill.

## Exceptions

No blanket redesign, no imposed English/French switch, no network fonts, no fictional usage metrics, no UI action that bypasses actual server/extension constraints.
