# TNND settings ownership and migration

## Contract

- **TNND Web / backend profile**: identity + approved About Me, origin/home/current city, own Instagram/WhatsApp and contact handoff, relationship preferences, language behavior/weights, texting style, global tone/flirt/humor/length, vocabulary, global instructions, Gemini provider credentials, profile import/export and privacy.
- **Extension options (local, browser session)**: explicitly enabled Tinder automation, reply delays, opener pacing, first-message attempt cap, daily automatic-reply cap, quiet hours, Conversation Flow toggle/order. These settings affect the active browser integration and are not inferred from an imported Web profile.
- **Per-chat overrides**: only the selected authenticated conversation; never mutate global defaults.

## Connected experience

TNND Web is the only writable source for global profile settings. The extension reads an authenticated, user-scoped snapshot on opening Options. A failed refresh shows an error and can use only a snapshot tagged with the current account. An unscoped legacy cache is never trusted; users can refresh to recreate it.

The extension exposes a single canonical Web link and **Refresh saved Web settings**, while connected. It hides duplicated profile editors and local Gemini-key controls; saving in Options writes only browser-specific controls and does not mirror editable Web identity/style values into local fallback or overwrite the Web API key.

## Disconnected experience

Historical extension profile data is retained in local storage, with the legacy editors collected inside one collapsed **Local profile fallback** section. Import/export works locally only, never claims to update Web. On reconnect, authenticated Web values take precedence without deleting local fallback data.

## Invariants & remaining work

- A Web profile can change writing style but **cannot turn on browser automation**; extension ON/OFF consent remains explicit and local. Backend policy gates and server-controlled message confirmations remain in force.
- Do not mark a Web profile as saved when an API request fails. Do not display stale profiles from a different account.
- Preserve existing HTML input IDs, per-chat management and extension sender/selector behavior.
- Browser screenshots and real Web + extension roundtrips still require manual QA. Do not use synthetic tests as evidence of delivery by Tinder.
- Longer-term: migrate explicit browser-owned controls to an authenticated per-device preferences endpoint if multi-device sync becomes a concrete need; keep device-level opt-in separate from global account preferences.
