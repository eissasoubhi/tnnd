# Product Design Expert — review / definition of done

Use proportionately; report observed vs assumed findings and executed vs unexecuted tests.

## UX & information architecture
- [ ] User and primary task are clear; one leading action is discoverable.
- [ ] Navigation, wayfinding, back/cancel and reversible filters are understandable.
- [ ] Related controls are grouped; advanced options do not overwhelm core actions.
- [ ] No redundant metric/cards; density and hierarchy reflect importance.

## Content design
- [ ] Headings, CTAs, labels, hints, empty/loading/error/success states are precise and coherent.
- [ ] Web and extension use consistent vocabulary.
- [ ] AI draft, suggested, approved, sending, sent and failed states are truthful and separate.
- [ ] Uncertain data is not passed off as verified; counts/limits are explained accurately.

## UI & accessibility
- [ ] Neo Bento tokens, hierarchy, typography and components are reused, not duplicated inconsistently.
- [ ] Realistic long text, mobile and extension viewports don't overflow or hide controls.
- [ ] Accessible names, label association, focus order and keyboard navigation work.
- [ ] Contrast, non-color cues, WCAG 2.2 AA and reduced motion considered.
- [ ] Pending/disabled/hover/selected/focus/error states are visibly distinct.

## Behavior & safety
- [ ] No behavior regression in message approvals, limits, sync, identity or privacy.
- [ ] Unsaved edits persist across section navigation as currently intended.
- [ ] Extension host DOM, scrolling, click targets and focus aren't disrupted.
- [ ] Offline/errors/permissions/retry have truthful, actionable handling.

## Verification
- [ ] Applicable root/web tests/typecheck/build executed, and outcomes recorded.
- [ ] Existing visual/functional CI QA evaluated where applicable.
- [ ] Browser inspection/screenshot/device matrix verified or explicitly marked pending.
- [ ] No claim of live Tinder sending or platform readiness without real test evidence.

## Priorities
- P0: core action blocked, destructive/misleading state, serious accessibility or host-page breakage.
- P1: confusing or unreliable task, wrong state, broken mobile/extension UX.
- P2: weak hierarchy, inconsistency, unnecessary clicks or vague microcopy.
- P3: visual refinement with minor impact.

Address P0/P1 before P3. Use `docs/design/PRODUCT_PROFILE.md` for TNND-specific context.
