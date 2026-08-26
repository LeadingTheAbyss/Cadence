<p align="center">
  <img src="logo.png" alt="Cadence Logo" width="300">
</p>

# Cadence

**A Browser-Native Accountability Layer for Daily Competitive Programming & Contribution Streaks**

I built Cadence because reminder apps you have to open don't work — you forget to open them. Cadence instead surfaces itself: an aggressive, persistent banner injected directly into every webpage you browse, staying visible until you've actually done the work.

Cadence continuously tracks three independent signals of daily progress — a LeetCode daily challenge solve, a GitHub contribution, and a Codeforces submission — and refuses to let you forget about any of them until they're done.

## 🚀 What It Does

Cadence runs silently in the background of your browser, polling each platform on a fixed interval. The moment it detects a gap in your daily streak, it renders a floating reminder card on top of whatever page you're currently on — LeetCode, GitHub, Codeforces, or anything else — with direct links back to the platform, a manual re-verification action, and short-term snooze controls (+2h / +6h) for when you're mid-focus and don't want the interruption yet.

## 🧩 Architecture & Components

Cadence is built as a Manifest V3 browser extension, split cleanly across a background service worker, a content-injected UI layer, and a settings surface:

**Background Service Worker (`background.js`)**
The persistent polling core. Runs on a 5-minute `chrome.alarms` cycle, independently querying three external APIs — LeetCode's GraphQL endpoint, GitHub's GraphQL contribution calendar, and Codeforces' public REST API — and reduces each response down to a single boolean "done for today" state, written to `chrome.storage.local`.

**Content Script (`content.js`)**
Injected into every page via a `<all_urls>` match. Reads live state out of extension storage and renders a self-contained, dependency-free reminder card directly into the DOM — no iframe, no external assets, styled entirely through an injected `<style>` block so it survives on any host page regardless of that page's own CSS.

**Options Page (`options.html` / `options.js`)**
A minimal settings surface for configuring your LeetCode username, Codeforces handle, and GitHub username + Personal Access Token. Nothing is bundled or hardcoded — every identity is user-supplied and stored exclusively in local extension storage.

## 📖 Daily-Progress Detection Logic

Each of the three platforms is checked independently and asynchronously, and a failure in one never blocks the others:

- **LeetCode** : fetches the active daily coding challenge, then cross-references your last 15 accepted submissions for a match timestamped after midnight IST.

  <img src="LC_Graph.png" alt="LeetCode submission graph" width="600">

- **GitHub** : authenticates via a user-supplied PAT and queries the GraphQL contribution calendar for a non-zero contribution count on the current UTC date.

  <img src="Github_Graph.png" alt="GitHub contribution graph" width="600">

- **Codeforces** : pulls your last 20 submissions from the public API and checks for anything timestamped after midnight IST.

  <img src="CF_Graph.png" alt="Codeforces submission graph" width="600">

If any network call fails, Cadence doesn't fail silently or spam retries — it schedules a single one-minute retry alarm for that specific check and leaves the others unaffected. A global snooze respects your focus time by suppressing re-flagging until it expires, at which point checks resume automatically.

## ⚙️ Installation

1. Clone this repository.
2. Open `chrome://extensions` (or the equivalent in any Chromium-based browser).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the project folder.

## 🔑 Setup

Open the extension's **Options** page (right-click the extension icon → Options) and configure:

- **LeetCode username** : used to check recent accepted submissions.
- **Codeforces handle** : used to check recent submissions.
- **GitHub username + Personal Access Token** : GitHub's contribution calendar requires authenticated GraphQL access. Create a [classic PAT](https://github.com/settings/tokens) with just the `read:user` scope.

Any of the three can be left blank to skip that specific check entirely.

Tokens and usernames never leave your machine except in direct, authenticated calls to that platform's own API — nothing is proxied, logged, or sent to any third party.

## 🔐 Permissions

- `alarms`, `storage` : periodic background polling and local state persistence.
- `host_permissions` for `leetcode.com`, `api.github.com`, `codeforces.com` : direct API access.
- `<all_urls>` content script match — so the reminder can surface on any page you're browsing, not just the tracked platforms.

## License

MIT — see [LICENSE](LICENSE).
