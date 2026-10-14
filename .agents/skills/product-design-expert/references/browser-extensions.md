# Browser extension UX — TNND popup, options, preview, injected UI

## Surfaces
- `public/popup.html` + `src/popup.ts`: a **compact control/status surface**, not a miniature dashboard. Prioritize account/connection health, immediate user task, and one clear next action; group diagnostics and advanced setup below.
- `public/options.html` + `src/options.ts`: complete settings grouped by intent, readable labels/help, persistence status, safe save and recovery. Layout may be wider than popup.
- `public/preview.html` + `src/preview.ts`: distinguish harmless text simulation from a live message. Show effective configuration and prohibit implicit send.
- Content scripts and injected UI: no unexpected overlays, backdrop interception, keyboard traps, scroll/focus theft, DOM breakage or expensive observers on Tinder.

## Product behavior safeguards
- Preserve all existing message confirmation, daily first-message count, account/session, manual takeover and consent gates.
- Do not claim chat scanning, sync, identity detection or sending has completed without verified data.
- Missing connection, permission, blocked action, stale data, offline mode and retry must be visible in plain language.
- A popup may close automatically: don't rely on ephemeral popup state for drafts or critical progress.
- Avoid unnecessary backend/Gemini calls merely to render or reopen the popup.
- Do not fabricate Tinder selectors or weaken host-site safety controls.

## Visual, accessible, performance
- Respect TNND Neo Bento tokens from `public/neo-bento.css`; do not reuse full web layout in the 380px popup.
- Work in narrow widths and constrained popup height. Key action must remain reachable; long translated labels must wrap.
- Maintain 44px target guidance, focus-visible, keyboard tab order, accessible error/status labels and readable contrast.
- Don't break the host page's scrolling, positioning, click targets or event handling.
- Respect Firefox/Chrome differences to the degree the project officially supports.

## Verification
- The root test `npm run test:extension-neo-bento` checks extension styling assumptions.
- Root CI runs `node scripts/visual-qa-extension.mjs` and uploads screenshots; it does not replace manual testing of Tinder in a real account.
- Review popup, options, preview at expected widths and consider injected UI host-page interaction separately.
