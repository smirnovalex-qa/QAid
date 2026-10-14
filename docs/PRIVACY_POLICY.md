# QAid — Privacy Policy

_Last updated: 2026-10-14_

QAid is a local-first QA toolbox for Chromium-based browsers. This policy explains what
QAid does and does not do with your data.

## Summary

**QAid does not collect, transmit, sell, or share any personal or user data.** Everything
QAid does happens locally in your browser and on your device.

## What QAid processes and where it stays

QAid's tools operate on the page you are testing and on data you provide. All of it is
processed locally and never sent to us or any third party:

- **Settings and presets** — stored locally via `chrome.storage` on your device. If you
  opt in to settings sync, Chrome syncs them through your own Google account using
  `chrome.storage.sync`; QAid operates no server and never receives them. Secret spaces
  (storage/cookie snapshots, logs, session profiles) are never synced.
- **Bug reports, screenshots and screen recordings** — assembled locally into files
  (Markdown/JSON, PNG, WebM/GIF) and saved only when you choose to download or export them.
- **Page data, tokens, cookies, storage and form values** — read and edited locally for the
  tool you are using; never transmitted off the device.
- **Session profiles** — stored only in local storage, optionally encrypted with a
  master password using the browser's native WebCrypto. Never synced, never transmitted.

## No data collection

QAid has no account, no sign-up, no analytics, and no telemetry. QAid's core makes no
network requests. QAid does not use remote code.

## Permissions

QAid follows a least-privilege model. Only essential permissions are granted at install;
access to page content, scripting, cookies and screen capture is requested at runtime under
an explicit user gesture and only for the tool in use. Each permission is used solely to
provide the corresponding tool's functionality on your device. A full explanation is in the
project's PERMISSIONS documentation.

## Third parties

QAid does not send data to any third party. Any network requests you observe in the browser
originate from the website you are testing, not from QAid.

## Children's privacy

QAid is a developer tool and is not directed to children.

## Changes

If this policy changes, the updated version will be published at this page with a new
"Last updated" date.

## Contact

For questions about this policy, contact the maintainer via the project's repository.
