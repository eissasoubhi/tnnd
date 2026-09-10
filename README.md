# TNND

TNND is a Chrome extension companion for Tinder Web. It keeps the user in control while making conversations faster and more personal with Gemini-powered drafts.

## MVP

- Gemini reply suggestions from the visible Tinder conversation/profile context.
- Three configurable draft variants by default.
- One-click insertion into the Tinder message composer; **TNND does not send the message for you**.
- Tone presets: playful, flirty, direct, warm, chill, witty.
- Configurable flirt level, humor, emoji usage and message length.
- Language mix weights for French, Moroccan Darija, English and Arabic.
- Preferred/avoided vocabulary, user-approved personal context and custom instructions.
- Single-action Like helper for the currently visible profile.
- Gemini API key stored in `chrome.storage.local`; storage access is restricted to trusted extension contexts when Chrome supports it.

TNND intentionally does not implement anti-detection, fingerprint spoofing, CAPTCHA bypass, hidden rate-limit bypass, endless auto-like loops or autonomous chat impersonation.

## Stack

- Chrome Manifest V3
- TypeScript
- Vite (programmatic multi-entry builds)
- Gemini `generateContent` API

The default model is `gemini-3.8-flash`, but it is editable in Options.

## Local development

```bash
npm install
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the generated `dist/` folder.

For rebuild-on-change:

```bash
npm run dev
```

After rebuilding, reload TNND from `chrome://extensions` and refresh Tinder Web.

## Configuration

Click the TNND extension icon to open Options, then configure:

1. Gemini API key and model.
2. Conversation tone and flirt/humor/emoji levels.
3. French / Darija / English / Arabic weights.
4. Words to prefer or avoid.
5. Personal context the AI is allowed to use.
6. Extra instructions for your own writing style.

On Tinder Web, TNND adds a small floating panel. **Generate replies** sends the visible context to Gemini. **Insert draft** fills the message field, after which you review and send it yourself.

## Maintenance note

Tinder's DOM can change. Tinder-specific selectors and composer/Like detection live in `src/tinder-adapter.ts` so they can be updated without touching the Gemini or settings layers.
