# TNND

TNND is a Chrome extension message copilot for dating-app conversations. The first version is deliberately user-controlled: you paste the context you want to share with Gemini, TNND drafts replies in your style, and you choose what to copy and send yourself.

## MVP

- Manual conversation/profile context input.
- Gemini-powered reply suggestions.
- Three configurable draft variants by default.
- Tone presets: playful, flirty, direct, warm, chill, witty.
- Configurable flirt level, humor, emoji usage and message length.
- Language mix weights for French, Moroccan Darija, English and Arabic.
- Preferred/avoided vocabulary, user-approved personal context and custom instructions.
- Copy button for each generated draft.
- Gemini API key stored in `chrome.storage.local`; storage access is restricted to trusted extension contexts when Chrome supports it.

TNND intentionally does not implement anti-detection, fingerprint spoofing, CAPTCHA bypass, rate-limit bypass, endless auto-like loops, autonomous message sending, or direct Tinder DOM automation.

## Why the manual boundary exists

Tinder's current Terms of Use prohibit automated processes and third-party applications/services that directly interact with Tinder or Member Content without written consent, including AI/ML systems. This MVP therefore does not request Tinder host permissions and does not read or click Tinder pages.

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

After rebuilding, reload TNND from `chrome://extensions`.

## Usage

1. Click the TNND extension icon.
2. Add your Gemini API key and configure your style.
3. Paste the relevant dating-app conversation or profile context into **Message Lab**.
4. Click **Generate replies**.
5. Pick a draft, click **Copy**, review/edit it if needed, and send it yourself.

## Next safe improvements

- Named style presets (for example "Darija chill", "FR playful", "EN direct").
- Conversation sessions stored locally so you can keep context without repasting everything.
- First-message / reply / date-proposal modes.
- Per-contact style overrides stored locally under aliases chosen by the user.
- Export/import of settings without exporting the Gemini API key.
