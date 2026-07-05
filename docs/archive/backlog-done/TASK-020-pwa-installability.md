# TASK-020: PWA Installability

Status:
Done

Phase:
0

Problem:
The web app cannot be installed as a Progressive Web App on phones or desktops.

Business Value:
- An installed, home-screen app for field/phone use (faster launch, full-screen,
  no browser chrome).
- Foundation for later offline/caching work if it proves needed.

Scope:
- Valid web app manifest (`app/manifest.ts`).
- App icons 192 + 512 + maskable.
- Minimal service worker (`public/sw.js`), registered in production only
  (`ServiceWorkerRegistrar.tsx`).
- Document secure-origin requirement.

Acceptance Criteria:
- [x] Browser detects a valid manifest (linked, parses, required fields present).
- [x] App ships installable icon assets (192 + 512, resolve at their URLs).
- [x] Service worker is registered in production (and not in dev).
- [x] Lighthouse PWA / installability checks pass except where blocked by the
      deployment origin.
- [x] Documentation states that HTTP `.local` is not installable and that a
      secure origin (HTTPS, or `localhost`) is required.

Notes:
App layer complete. Production install prompt on `fsm.garonhome.local` requires HTTPS
origin per `docs/working/pwa-https-deployment.md` (Cloudflare Tunnel path) — a
deployment task, not an app-code blocker. Archived Phase 0 closeout (2026-07-06).