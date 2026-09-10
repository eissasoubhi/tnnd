# TNND

TNND is a Chrome extension that can generate and automatically send Tinder replies through Gemini, using a configurable identity and conversation style.

## Current v0.2 scope

- Tinder content script with an isolated DOM adapter.
- Automatic reply mode, disabled by default until explicitly enabled.
- Configurable reply delay, quiet hours and daily reply cap.
- Duplicate-message protection and no automatic retry when a send cannot be confirmed.
- Structured identity: first name, age, city, origin, occupation, interests and additional personal context.
- Optional Instagram and WhatsApp details with configurable off-app preference.
- Tone presets: playful, flirty, direct, warm, chill and witty.
- Configurable flirt level, humor, emoji usage and message length.
- Language mix weights for French, Moroccan Darija and English.
- Preferred/avoided vocabulary and custom style rules.
- Dedicated Chat Preview page that generates example conversations from the currently saved configuration.
- Gemini API key stored in `chrome.storage.local`; storage access is restricted to trusted extension contexts when Chrome supports it.

TNND does not implement CAPTCHA bypass, fingerprint spoofing, rate-limit bypass or mechanisms whose purpose is to evade platform detection. Direct Tinder integration should only be used where the account/user has the required permission to automate it.

## Stack

- Chrome Manifest V3
- TypeScript
- Vite
- Gemini `generateContent` API

The default model is `gemini-3.8-flash` and remains editable in Options.

## Local development

```bash
npm install
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist/`.

For rebuild-on-change:

```bash
npm run dev
```

Reload the extension after each rebuild.

## Setup

1. Open TNND Options.
2. Add the Gemini API key.
3. Fill in the identity fields that Gemini is allowed to use.
4. Configure FR / Darija / EN weights, tone, humor, flirt level and vocabulary rules.
5. Add Instagram / WhatsApp if desired and choose the off-app transition preference.
6. Open **Chat Preview** and generate examples until the style is right. Preview generation makes normal Gemini API calls.
7. Enable automatic Tinder replies when ready.

## Tinder DOM adapter

`src/tinder-adapter.ts` contains all Tinder-specific DOM discovery, conversation reading and message sending. The first implementation uses semantic selectors plus conservative layout fallbacks. Tinder's live DOM can change, so this file is intentionally isolated and should be adjusted from real-page diagnostics rather than spreading selectors throughout the codebase.

## Next priorities

- Real-page diagnostics for Tinder selectors and message direction detection.
- Per-conversation memory and per-match overrides.
- Conversation-stage classification: opener, normal reply, flirting, date proposal, re-engagement and off-app transition.
- Better preview scenarios and named style presets.
- Local activity log showing what triggered each automatic reply without storing more conversation content than necessary.
