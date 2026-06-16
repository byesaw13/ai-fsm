# EPIC-005: Platform & Delivery

How the app is packaged, served, and installed — the delivery surface beneath
the product features. Concerns here are cross-cutting (installability, secure
origin, offline behavior, deployment shape) rather than tied to any one
workflow.

## Active tasks

# TASK-020: PWA Installability

Status:
In Progress

Problem:
The web app cannot be installed as a Progressive Web App on phones or desktops.
There is no web app manifest, no app icons, and no service worker, so the
browser never offers an install prompt. Field use on a phone means living in a
browser tab instead of an installed app.

Business Value:
- An installed, home-screen app for field/phone use (faster launch, full-screen,
  no browser chrome).
- Foundation for later offline/caching work if it proves needed.

Scope:
- Add a valid web app manifest (`app/manifest.ts` metadata route) with name,
  short_name, start_url, `display: standalone`, theme/background colors, and
  icons.
- Add required app icons: 192x192 and 512x512 minimum (plus a maskable variant).
- Ensure the manifest is linked from the app metadata.
- Add a minimal service worker with a fetch handler and register it **only in
  production**.
- Confirm installability via Chrome DevTools / Lighthouse on a secure origin.
- Document the secure-origin requirement for production deployment.

Out of Scope:
- Offline caching / background sync (no real offline requirement yet — keep the
  service worker minimal; do **not** adopt `next-pwa` or a Workbox toolchain
  until a concrete caching/offline need exists).
- Push notifications.
- Solving the production HTTPS origin (tracked separately as a deployment
  blocker; see Notes).

Acceptance Criteria:
- [ ] Browser detects a valid manifest (linked, parses, required fields present).
- [ ] App ships installable icon assets (192 + 512, resolve at their URLs).
- [ ] Service worker is registered in production (and not in dev).
- [ ] Lighthouse PWA / installability checks pass except where blocked by the
      deployment origin.
- [ ] Documentation states that HTTP `.local` is not installable and that a
      secure origin (HTTPS, or `localhost`) is required.

Notes:
**Deployment blocker (separate from app config):** production runs at
`fsm.garonhome.local` over HTTP (`infra/compose.garonhome.yml`: "SSL: None for
.local LAN"). Chromium only offers install on a secure origin — HTTPS or
`localhost`. Even a perfect manifest + service worker will not produce an install
prompt on the current HTTP `.local` origin. Best path: a real domain/subdomain
fronted by the homelab Nginx Proxy Manager with Let's Encrypt; alternative: an
internal CA / trusted cert on the installing devices.

This task delivers the application layer and documents the origin requirement;
the HTTPS origin itself is a deployment task, not a code change. From an
app-config standpoint the criteria are satisfiable now; the final Lighthouse
"installable" green requires the secure origin to be in place.

Deployment runbook for the HTTPS path: `docs/working/pwa-https-deployment.md`.
Two routes — **Tailscale Serve** (recommended for phone/field use: trusted
`*.ts.net` cert, reachable on cellular over the tailnet, no public exposure) and
a **real subdomain + DNS-01 via NPM with AdGuard split-horizon** (LAN-only).
Split-horizon DNS does not work in the field, so Tailscale is the field answer.

## Completed

_None yet._
