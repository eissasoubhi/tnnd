# TNND

## Install the Chrome extension

1. Download the latest TNND extension build ZIP from the latest successful GitHub Actions `CI` run.
2. Unzip the downloaded archive.
3. Open Chrome and go to `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the unzipped TNND extension folder that contains `manifest.json`.
7. Open `https://tinder.com` and refresh the page once after installing or updating the extension.
8. Pin TNND from the Chrome extensions menu if you want quick access to the popup.

## Update an existing local installation

1. Download and unzip the newest TNND build.
2. In `chrome://extensions`, remove the previous TNND extension or point **Load unpacked** to the newly unzipped build folder.
3. Click **Reload** on the TNND extension if needed.
4. Refresh the open Tinder tab before testing the new version.

## V1 Tinder diagnostic test

For the current V1 validation, capture this sequence manually in Tinder:

`Discovery → Inbox → Conversation → Inbox → Discovery`

At each step:

1. Open the TNND popup.
2. Check the detected Tinder view.
3. Click **Export Tinder diagnostics ZIP**.
4. Keep the generated ZIP for analysis.

Diagnostics are user-triggered and are designed to redact authentication/session secrets and other sensitive values.