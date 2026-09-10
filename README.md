# TNND

TNND is a Chrome extension companion for Tinder Web.

## Scope

The project focuses on user-controlled assistance rather than stealth automation:

- AI-generated reply suggestions powered by Gemini.
- Configurable tone, language mix (French, English, Moroccan Darija), humor, vocabulary and message length.
- Local conversation context to improve continuity.
- One-click insertion of a generated suggestion into the Tinder composer; the user remains in control of sending.
- Optional single-action swipe helper for the currently visible profile.
- No anti-detection, CAPTCHA bypass, fingerprint spoofing, hidden-rate-limit bypass, or autonomous impersonation.

## Planned architecture

- Chrome Manifest V3
- TypeScript
- Vite
- Gemini API called from the extension service worker
- `chrome.storage.local` for the API key and local preferences
- Tinder DOM integration isolated behind a small adapter so selectors can be maintained independently

Development is starting on the `feat/mvp-ai-copilot` branch.
