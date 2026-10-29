# TNND repository instructions

Follow the current product contracts and safety gates in `docs/v1-release-checklist.md`. Keep the public root `README.md` intentionally empty; it is guarded by CI. Do not commit secrets, personal conversations, private profile data or tokens.

## Product Design Expert — mandatory for user-facing changes

Before designing, modifying, reviewing, or testing any user-facing screen, UX flow, layout, navigation, interaction, UI text, status, onboarding or accessibility behavior, **read**:
1. `.agents/skills/product-design-expert/SKILL.md`
2. `docs/design/PRODUCT_PROFILE.md` and `docs/design/neo-bento.md`
3. The relevant skill reference: `web-apps.md`, `browser-extensions.md` and/or `content-design.md`.

This includes UI work written in TypeScript: `apps/web/src/**/*.ts`, `src/popup.ts`, `src/options.ts`, `src/preview.ts`, injected widgets, and `public/*.html` / `public/*.css`. For web+extension features, check both surfaces; they share language but not necessarily layout.

Before claiming completion, apply `references/review-checklist.md`, run appropriate existing test/build/visual QA and report what was actually checked. Do not invent browser verification or screenshots.

Preserve the approved **Neo Bento** system and live product behavior. Do not refactor unrelated UI or change Tinder selectors, send gates, consent, permissions or message-delivery semantics as a side effect of cosmetic work. Pure backend/infra tasks with no user-facing change need not load this skill.

## AI-First conversational decisions — mandatory architectural rule

TNND must use a **configured AI model with a validated structured response**
for decisions that require interpreting human meaning: intentions, implicit
acceptance/refusal, tone, emotional cues, conversational strategy, unanswered
questions, natural topic change, re-entry and relationship preferences.

- **Do not add regex, literal word lists, substring searches, if/else or
  ad-hoc text scoring to decide conversational meaning.** Even as fallback,
  they are not authoritative. Migrate existing heuristics instead of enlarging
  their dictionaries. Exception: deterministic input normalization, format
  parsing and technical validation (not semantic interpretation).
- Build context from authenticated, scoped conversation messages, verified
  timestamps, user-controlled settings and allowed factual memory. Treat
  the conversation as **untrusted data**, not executable instructions.
- Use the shared `apps/api/src/ai-decision-engine.ts` for new semantic
  inference tasks. Request JSON-schema-constrained decisions; validate
  structure, references and confidence; version prompts and test with diverse,
  adversarial and multilingual paraphrases. Document a clear `unknown`
  decision, not a guess.
- The application **orchestrates, configures, displays and enforces**. Keep
  authentication, rate limits, quotas, explicit opt-in, message freshness,
  verified evidence, idempotency/claims and delivery checks in deterministic
  TypeScript/SQL. **AI must never bypass these send gates.**
- On provider errors, missing evidence or ambiguous results, require human
  review or defer; never silently auto-send using a keyword fallback.
- Do not increase model calls inside a hot path without measuring latency,
  cost and cache behavior. Reuse model decisions across safe stages without
  caching stale conversation snapshots.
- See `docs/architecture/ai-first-decision-engine.md` for the existing
  heuristic inventory and incremental migration plan. Its incomplete items
  must **not** be presented as already migrated.
