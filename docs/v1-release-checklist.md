# TNND V1 release checklist

This checklist is the release gate for the first usable TNND platform build. The public root README intentionally stays empty while the repository is public.

## Automated gates

Run from the repository root unless noted otherwise.

- [ ] Root extension CI passes: `npm install && npm run build`
- [ ] Web checks pass: `cd apps/web && npm install && npm run typecheck && npm test && npm run build`
- [ ] API checks pass: `cd apps/api && npm install && npm run typecheck && npm test`
- [ ] Database migrations apply successfully in a disposable PostgreSQL database: `cd apps/api && npm run migrate`
- [ ] Root `README.md` is still exactly empty.
- [ ] Extension `package.json` and `public/manifest.json` versions match.
- [ ] No local `.env` files, credentials, session material or personal profile data are tracked.

## Privacy and security

- [ ] Gemini/provider secrets are encrypted at rest and are never returned by account export.
- [ ] Account export contains only data owned by the authenticated account.
- [ ] Individual conversation, MatchProfile and Personal Memory deletion are authenticated and user-scoped.
- [ ] Full account deletion requires the current password and removes account-owned server data through cascades.
- [ ] Temporary pre-match profile retention is configurable and expired captures are cleaned up.
- [ ] Production API traffic requires direct TLS or an explicitly trusted reverse proxy.
- [ ] Server error logs do not serialize message content, exception messages, stacks, causes or arbitrary thrown values.
- [ ] Diagnostic exports contain no Tinder cookies, auth tokens or session secrets.

## Product behavior

- [ ] Web login/session management works after a fresh install.
- [ ] Extension reconnect restores server-side profile/configuration.
- [ ] Conversation sync is idempotent and preserves message history.
- [ ] Per-chat status, overrides and temporary instructions work independently.
- [ ] Human Action Required pauses only conversations that require blocking intervention and never pretends an external action happened.
- [ ] Personal Memory ingestion/review/retrieval stays grounded in user-provided facts.
- [ ] Topic state and analytics operate from persisted backend data.
- [ ] Preview/simulation never sends a Tinder message.
- [ ] Account export and account deletion are usable from the Web App.

## Tinder integration release gate

These checks require diagnostics captured from real Tinder pages. Do not replace them with guessed selectors.

- [ ] Validate current profile/thread/message selectors against a recent, user-triggered redacted diagnostic ZIP.
- [ ] Validate unread-thread discovery against real diagnostics.
- [ ] Validate message delta capture and thread identity against real diagnostics.
- [ ] Run selector regression fixtures derived only from observed DOM.
- [ ] Confirm manual takeover and send-confirmation behavior in a real test conversation.

Until these checks are completed with real diagnostics, Tinder-DOM-dependent automation remains blocked and must not be marked release-ready.

## Final release

- [ ] Re-run all workflows on the final `main`.
- [ ] Review open PRs and confirm no required V1 work is stranded on branches.
- [ ] Review roadmap issue #5 against the implemented code and update stale checklist state.
- [ ] Choose the release version only after the Tinder integration gate is complete.
- [ ] Build the final extension artifact and verify its integrity metadata/checksums.
- [ ] Smoke-test Web + API + extension connection from a clean session.
