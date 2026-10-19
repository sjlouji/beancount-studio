# ADR 0001: The Mac app is an Electron shell that loads the web client from a server

**Status:** Accepted · 2026-10-19

## Context

Beancount Studio ships as a web app (Next.js client, FastAPI backend) that people self-host.
We want a Mac app as well, built the way Slack builds its desktop clients: the same web client,
wrapped in a native shell that adds what a browser tab cannot. The team is small and the web
client already carries every feature, so duplicating UI in a second stack is not an option.

## Decision

`apps/desktop` is an Electron application that loads a Beancount Studio server's web UI in a
hardened window. It does not bundle the web client and it does not embed the API.

- **Server first.** On first launch the shell asks for a server address, checks
  `/api/healthz`, saves the origin and loads it. Sign-in happens on the server's own pages; the
  session cookie lives in Electron's persistent session.
- **Hardened by default.** Context isolation and the sandbox are on, Node integration is off.
  Navigation is limited to the connected server's origin and the shell's own connect screen;
  every other link opens in the default browser. `<webview>` is blocked. Only notifications,
  clipboard writes and fullscreen are granted, and only to the server origin.
- **Small bridge.** The preload exposes `window.studioDesktop` typed by
  `packages/desktop-bridge`. The web client treats its absence as "running in a browser".
- **Native pieces live in the shell.** Menus, dock badge, notifications, deep links, drag and
  drop onto the app, auto-update and code signing are shell concerns and never require a server
  release.

## Consequences

- Web and desktop cannot drift: the shell always renders whatever the server serves, so a
  server upgrade is a desktop upgrade. Shell releases are rare.
- The app needs a reachable server. An offline splash is a shell feature; a fully offline mode
  would mean embedding the API (see Alternatives) and is deferred.
- Electron's size (roughly 100 MB installed) is accepted for parity with the browser engine and
  the Slack-style architecture.
- Loading remote content in Electron is the sensitive part of this design; the hardening rules
  above are requirements, not defaults to relax.

## Alternatives considered

- **Tauri.** Much smaller binaries and a Rust core, but WKWebView instead of Chromium and a
  different plugin model. Rejected for now to stay on the Slack-style stack; revisit if download
  size becomes a real complaint.
- **Bundling the web client in the app.** Keeps working without the server's static assets but
  couples every UI change to a desktop release. Rejected.
- **Embedding the API as a sidecar.** Gives a server-less local mode. Packaging Python for a
  signed, notarized Mac app is substantial work; deferred until the shell proves demand.

## Follow-ups

1. Code signing and notarization in CI (Developer ID certificate, Apple API key), auto-update
   from GitHub Releases, app icon.
2. Deep links (`beancount-studio://…`) and native notifications wired to the web client.
3. Multi-server sidebar, drag a receipt or statement onto the dock icon, menu bar quick-add.
4. Desktop awareness in the web client (title-bar layout, native notification preference) using
   the bridge.
