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
