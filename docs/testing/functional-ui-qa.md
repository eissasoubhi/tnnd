# TNND — automated functional and UX audit

This suite addresses the gap between visual screenshots and **working**
interactions. It deliberately separates isolated fixture tests from read-only
checks on a signed-in real account.

## 1. Run the audit in the Chrome extension (real local TNND Web)

1. Update the TNND repository.
2. Run `docker compose up -d --force-recreate api web`.
3. Rebuild the extension with `docker compose run --rm extension`.
4. In `chrome://extensions`, click **Reload** on the unpacked TNND extension
   (install `dist/` if it is not already loaded).
5. Open `http://127.0.0.1:5173`, sign in and wait for workspace panels.
6. Keeping **that Web tab active**, open the TNND extension popup.
7. In **TNND Web diagnostic**, click **Run UI & button audit**.
8. Read the error/warning totals and click **Export UI audit JSON**.
   Review the JSON before sharing it.

The audit **does** click all seven workspace navigation links and the visible
expandable summaries, restoring their previous state. It **inspects** every
visible enabled button (accessible label, geometry/overflow, 36px target
warning) and checks duplicate IDs and in-page anchor destinations.

The live-account audit **never presses arbitrary save, send, approve, confirm,
delete, revoke, AI generation or payment controls** because that could modify
real user data. Those flows need a separate synthetic-fixture test or a
supervised user-confirmed manual test.

The exported JSON is bounded and contains no input values, chat messages,
API keys, email addresses, auth tokens, or response bodies. It includes generic
static control IDs/classes, counts, test status, and UI geometry warnings.
Do not include unsanitized Tinder screenshots in bug reports.

## 2. Run the browser interaction CI suite (synthetic fixture)

The GitHub CI workflow `.github/workflows/ci.yml`:
- Builds the actual extension and validates popup/options/preview appearance,
  dark/light theme and 390px/1280px widths.
- Builds the actual Vite Web app against a **fake local API**; no real database,
  Tinder login, Gemini API, or personal messages are involved.
- Boots headless Chrome with the **unpacked extension loaded** and drives Web
  buttons via Chrome DevTools.
- Clicks/asserts account sign-in, lazy workspace loading, conversation details,
  all 7 navigation links, dating-goal example, preferences save exactly once,
  search filtering, Resume (HTTP PATCH), temporary instruction save/clear,
  Gemini provider connection check (mocked), draft generation and local approval.
- Checks desktop 1440px and mobile 390px for horizontal overflow/clipped enabled
  controls and captures screenshots.
- Executes the *same compiled extension UI audit bundle* on the fixture Web
  page through a **synthetic runtime-message shim**. The headless CI Chromium
  runner registers the extension service worker but does not reliably inject
  content scripts. Therefore this tests the audit implementation, **not** the
  production popup-to-tab messaging path.
- Uploads `artifacts/web-interaction-qa/report.json`,
  `extension-ui-audit.json`, and viewport screenshots as a GitHub Actions
  artifact `tnnd-web-interaction-qa-<sha>`.

### Local execution with installed Chromium

```bash
npm install
npm run build
npm --prefix apps/web install
VITE_TNND_API_BASE_URL=/ npm --prefix apps/web run build
CHROME_BIN=/path/to/chromium node scripts/functional-qa-web.mjs
```

Running the browser test does not touch a real account.

## 3. UX design guidelines applied in this pass

- **Conversation drafting first**: Paste incoming message → Generate draft →
  Copy. Sending to Tinder is always separate.
- Per-chat overrides and confirmation of a message **already sent** are
  collapsible **advanced** actions.
- The extension's long Tinder diagnostic workflow is collapsed by default.
- The UI audit flags short targets, unlabeled buttons, broken anchor navigation,
  duplicate IDs, and viewport overflow.
- Accessible focus states and responsive Neo Bento layouts are preserved.

## 4. Remaining coverage (not claimed as passing)

- Actual Tinder DOM selectors, browser content-script message injection on a
  real desktop Chrome profile and one-shot read-only sync.
- Real Gemini API generation, quotas, provider errors and answer quality.
- Payment, account deletion/revocation, privacy deletion, all identity and
  personal-memory mutations, action-center workflows and every nested override.
- User comprehension/usability testing with a real user (the fixture suite
  cannot establish whether a button is *intuitive*).

Each of these needs an explicit isolated test fixture or user-supervised
verification before it can be marked as validated. New interactive controls
should be accompanied by regression coverage rather than being counted
as covered merely because the page renders.
