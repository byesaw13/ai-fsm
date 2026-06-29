# PWA HTTPS Deployment Runbook (TASK-020 blocker)

Status: planning runbook. This is the **deployment** half of TASK-020 (PWA
Installability). The application layer already shipped (manifest, icons, service
worker, production-only registration, Dockerfile `public/` copy — PR #321). What
remains is giving production a **secure origin** so the browser will actually
offer "Install".

## Why this is required

Chromium only offers PWA install on a **secure context** — HTTPS, or
`localhost`. Production currently serves `fsm.garonhome.local` over **HTTP**
(`infra/compose.garonhome.yml`: "SSL: None for .local LAN"). No manifest or
service worker can make an HTTP `.local` origin installable.

`.local` is the deeper problem: it is mDNS, not real DNS, so a public CA
**cannot** issue a certificate for it. The fix is a **real domain/subdomain**
with a real, universally-trusted cert.

## Who needs to reach it (the decision driver)

Field use spans three audiences:

- **You** — install the PWA, daily field use.
- **Employees / field techs** — install the PWA, daily field use, on cellular.
- **Clients** — use the portal in a mobile browser (approve estimates, view
  visits, pay invoices); installing is a nice-to-have, not a requirement.

Because **clients** (non-technical, off-network) must reach it on cellular, the
origin must be **publicly reachable without a VPN client**. That rules out
Tailscale Serve (tailnet-only) and split-horizon DNS (LAN-only). The answer is a
public HTTPS origin that hides the home box: **Cloudflare Tunnel**.

> Tailscale was evaluated and removed. It required the Tailscale app on every
> device — impossible for clients — and `tailscale serve` fought NPM for host
> port 443, causing reboot-order breakage. Cloudflare Tunnel needs no host port
> and no client software.

## Current topology

```
Browser ──► Nginx Proxy Manager (homelab, :80/:443) ──► ai-fsm-web:3000
                                                         (business_proxy network alias)
```

- NPM is the homelab reverse proxy with Let's Encrypt already in use.
- AdGuard Home (`192.168.40.27`) is LAN DNS.
- The web container joins `business_proxy` under alias `ai-fsm-web`; NPM
  forwards to `ai-fsm-web:3000` (already documented in `compose.garonhome.yml`).

Cloudflare Tunnel attaches to that same `business_proxy` network and routes the
public hostname to `ai-fsm-web:3000` (or to NPM, if you prefer NPM to stay the
single ingress point). No host ports are exposed; the app service has **no**
`ports:` mapping.

## Recommended: Cloudflare Tunnel

You already own a domain on Cloudflare. `cloudflared` runs as an outbound-only
daemon on the garonhome box: it dials out to Cloudflare's edge, so there are **no
inbound ports**, the home IP stays hidden, and host 443 is never bound (so the
old NPM conflict cannot recur). Cloudflare terminates a trusted public cert for
`app.<domain>` at its edge — every device, on LAN or cellular, trusts it
automatically and can install the PWA.

### Steps

1. **Pick the hostname.** A subdomain of your Cloudflare-managed zone, e.g.
   `app.dovetails.app` (substitute your real domain).

2. **Create the tunnel.** In the Cloudflare Zero Trust dashboard → Networks →
   Tunnels → Create a tunnel (Cloudflared). Name it (e.g. `garonhome`). Cloudflare
   shows an install command containing the tunnel token.

3. **Run `cloudflared` on the garonhome box**, attached to `business_proxy` so it
   can resolve `ai-fsm-web`. Easiest is a container in the homelab compose:
   ```yaml
   cloudflared:
     image: cloudflare/cloudflared:latest
     restart: unless-stopped
     command: tunnel run
     environment:
       - TUNNEL_TOKEN=${CLOUDFLARED_TUNNEL_TOKEN}
     networks:
       - business_proxy
   ```
   Put `CLOUDFLARED_TUNNEL_TOKEN` in the homelab `.env` (never commit it).

4. **Add a public hostname route** (in the tunnel's Public Hostnames):
   - Subdomain/domain: `app.dovetails.app`
   - Service: `http://ai-fsm-web:3000`
     (or `http://<NPM alias>:80` if you want NPM to remain the single ingress and
     keep its existing routing/headers — either works; routing straight to the app
     is fewer moving parts.)
   Cloudflare auto-creates the proxied DNS record for the subdomain.

5. **Point the app's base URL at the new host** in production env
   (`/opt/business/ai-fsm/env/.env`, modeled on `infra/garonhome.env.example`):
   ```
   APP_BASE_URL=https://app.dovetails.app
   APP_URL=https://app.dovetails.app
   ```
   > ⚠️ Naming inconsistency to reconcile: `garonhome.env.example` defines
   > `APP_BASE_URL`, but `apps/web/next.config.mjs` reads `APP_URL`
   > (→ `NEXT_PUBLIC_APP_URL`). Set **both** to the same https value so email
   > links, Stripe webhook URLs, and any client-side absolute URLs are correct.
   `SECURE_COOKIES` is already `true` in the compose, which is correct for HTTPS.
   Then redeploy: `bash scripts/deploy-garonhome.sh`.

6. **Service worker activates automatically.** Registration is gated on
   `NODE_ENV === "production"` **and** a secure origin
   (`apps/web/app/ServiceWorkerRegistrar.tsx`). Once the origin is HTTPS it
   registers `/sw.js` on next load with no code change.

### Auth posture (because it is now public)

- **Client portal routes** stay protected by the app's own client auth — clients
  open `app.dovetails.app` in a browser and sign in as today. No extra gate.
- **Internal/staff routes** can optionally sit behind **Cloudflare Access**
  (email OTP or SSO) in addition to app auth, for defence in depth. Do **not**
  put Access in front of the whole hostname if clients must reach the portal.

## Verification (closes the remaining TASK-020 criteria)

1. Load `https://app.dovetails.app` from a device **off** the LAN (phone on
   cellular) — padlock valid, no cert warning, app loads.
2. DevTools → Application:
   - **Manifest**: parses, icons load, "Installability" shows no errors.
   - **Service Workers**: `/sw.js` activated.
3. Run **Lighthouse → PWA** (or the installability audit) — expect the
   "installable" checks to pass now that the origin is secure.
4. Confirm the browser offers **Install** (omnibox icon / menu), and the
   installed app launches standalone with the dovetail icon + slate theme.

## Decommissioning Tailscale

Tailscale is being removed from the system. After Cloudflare Tunnel is verified:

- On the garonhome box: `sudo tailscale serve reset` then `sudo tailscale down`
  (or uninstall the daemon entirely).
- Revert the homelab NPM workaround that bound NPM to the LAN IP
  `192.168.40.27` to dodge the `tailscale serve` 443 collision — with Tailscale
  gone, nothing else wants host 443, so NPM can bind normally again
  (`~/docker`, homelab repo).
- No app-repo code references Tailscale after this change.

## Notes

- No application code changes are required to finish TASK-020 — this is infra +
  env only. Keep TASK-020 `In Progress` until the Lighthouse check passes on the
  HTTPS origin, then move it to `done/`.
- **Real subdomain + DNS-01 via NPM with AdGuard split-horizon** remains a
  fallback if Cloudflare Tunnel is ever undesirable, but it is **LAN-only** — the
  name resolves only through the home AdGuard rewrite, so it dies on cellular and
  cannot serve clients. Not suitable for the field-use requirement.
