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
(Let's Encrypt) **cannot** issue a certificate for it. The fix is a **real
domain/subdomain** with a real cert, resolved to the LAN box via the homelab's
existing DNS.

## Current topology (unchanged)

```
Browser ──► Nginx Proxy Manager (homelab, :80/:443) ──► ai-fsm-web:3000
                                                         (business_proxy network alias)
```

- NPM is the homelab reverse proxy with Let's Encrypt already in use.
- AdGuard Home (`192.168.40.27`) is LAN DNS.
- The web container joins `business_proxy` under alias `ai-fsm-web`; NPM
  forwards to `ai-fsm-web:3000` (already documented in `compose.garonhome.yml`).

So the proxy path is already correct. We only need a real hostname + cert + the
app's base-URL env pointed at it.

## Choosing a path: where will the phone be?

| Path | Works at home (LAN) | Works in the field (cellular) | Setup |
| --- | --- | --- | --- |
| **Tailscale Serve** (below) | ✅ | ✅ (over the tailnet) | Easiest; auto cert |
| **Real subdomain + split-horizon** | ✅ | ❌ (name resolves only via home DNS) | Real domain + DNS-01 |

> For genuine **field use**, split-horizon DNS is **not enough** — `fsm.<domain>`
> resolves only through the home AdGuard rewrite, so it dies on cellular. Use
> **Tailscale Serve**, which reaches the home box over the tailnet from anywhere.
> The subdomain path below is the right choice when install only needs to happen
> on the home LAN.

## Recommended for field use: Tailscale Serve

You already run Tailscale. `tailscale serve` puts the app behind HTTPS on the
node's MagicDNS name (`<host>.<tailnet>.ts.net`) with an **auto-provisioned,
universally-trusted cert** — no domain DNS, no NPM cert config, and **no public
exposure** (tailnet-only; this is `serve`, not `funnel`). Any device on the
tailnet — including your phone on cellular — can install it.

### Steps

1. **Tailnet prep (one-time).** In the Tailscale admin console enable **MagicDNS**
   and **HTTPS certificates** (DNS → "Enable HTTPS"). Install Tailscale on the
   garonhome box and the phone; sign both into the same tailnet.

2. **Expose the app to the host loopback.** This is the
   `127.0.0.1:3000:3000` mapping now on the `web` service in
   `compose.garonhome.yml` (loopback only — no LAN exposure). Redeploy `web` so
   the port is live: `bash scripts/deploy-garonhome.sh`.

3. **Serve it over the tailnet** (on the garonhome box):
   ```bash
   sudo tailscale serve --bg 3000          # serves 127.0.0.1:3000 at https://<host>.<tailnet>.ts.net
   tailscale serve status                   # confirm the https mapping
   ```

4. **Point the app's base URL at the tailnet name** in production env (so links,
   cookies, and absolute URLs match — install itself works regardless because
   the manifest uses relative URLs). `SECURE_COOKIES` is already `true` in the
   compose, which is correct for HTTPS:
   ```
   APP_BASE_URL=https://<host>.<tailnet>.ts.net
   APP_URL=https://<host>.<tailnet>.ts.net
   ```
   (Set both — see the naming note below.) Redeploy `web`.

5. **Install on the phone.** With Tailscale connected, open
   `https://<host>.<tailnet>.ts.net` in Chrome → menu → **Install app**. It
   launches standalone and works from anywhere the phone has the tailnet up.

> Trade-off: the phone must have Tailscale running to reach the app in the field.
> That is also a security win — the app is never publicly exposed.

## Alternative: real subdomain + DNS-01, split-horizon resolution (LAN-only)

Use a subdomain of a domain you own, e.g. `fsm.dovetails.app` (substitute your
real domain). The homelab box is **not** publicly reachable, and we want to keep
it that way, so:

- Obtain the cert via the **DNS-01** challenge (proves domain control through a
  DNS TXT record — no inbound HTTP needed, server stays private).
- Resolve the name to the LAN proxy via **split-horizon DNS** (AdGuard rewrite),
  so `fsm.dovetails.app` points at the NPM LAN IP on your network.

Because it's a real Let's Encrypt cert, **every device trusts it automatically**
— no per-device cert install (the key advantage over a self-signed/internal CA).

### Steps

1. **Pick the hostname.** A subdomain of a domain you control, on a DNS provider
   that NPM supports for DNS-01 (Cloudflare, etc.). Example: `fsm.dovetails.app`.

2. **DNS-01 credentials in NPM.** In Nginx Proxy Manager → SSL Certificates →
   Add Let's Encrypt Certificate → enable "Use a DNS Challenge", pick the
   provider, paste an API token scoped to that zone. Request the cert for
   `fsm.dovetails.app` (a wildcard `*.dovetails.app` also works if preferred).

3. **Proxy Host in NPM.** Add a Proxy Host:
   - Domain: `fsm.dovetails.app`
   - Forward Hostname: `ai-fsm-web`  (the network alias — stable)
   - Forward Port: `3000`
   - Scheme: `http` (TLS terminates at NPM)
   - SSL tab: select the cert from step 2; enable **Force SSL** and **HTTP/2**.
   - Confirm NPM is attached to the `business_proxy` network so `ai-fsm-web`
     resolves (it already is for `.local`).

4. **LAN resolution (AdGuard).** Add a DNS rewrite in AdGuard Home:
   `fsm.dovetails.app → <NPM LAN IP>` (the box running NPM). Now LAN devices
   resolve the real name to the local proxy; the public DNS record can stay
   absent or point elsewhere.

5. **Point the app's base URL at the new host.** Update production env
   (`/opt/business/ai-fsm/env/.env`, modeled on `infra/garonhome.env.example`):
   - `APP_BASE_URL=https://fsm.dovetails.app`
   - `APP_URL=https://fsm.dovetails.app`
   > ⚠️ Naming inconsistency to reconcile: `garonhome.env.example` defines
   > `APP_BASE_URL`, but `apps/web/next.config.mjs` reads `APP_URL`
   > (→ `NEXT_PUBLIC_APP_URL`). Set **both** to the same https value so email
   > links, Stripe webhook URLs, and any client-side absolute URLs are correct.
   Then redeploy: `bash scripts/deploy-garonhome.sh` (or recreate the `web`
   service).

6. **Service worker activates automatically.** Registration is gated on
   `NODE_ENV === "production"` **and** a secure origin
   (`apps/web/app/ServiceWorkerRegistrar.tsx`). Once the origin is HTTPS it
   registers `/sw.js` on next load with no code change.

## Verification (closes the remaining TASK-020 criteria)

1. Load `https://fsm.dovetails.app` on a LAN device — padlock valid, no cert
   warning.
2. DevTools → Application:
   - **Manifest**: parses, icons load, "Installability" shows no errors.
   - **Service Workers**: `/sw.js` activated.
3. Run **Lighthouse → PWA** (or the installability audit) — expect the
   "installable" checks to pass now that the origin is secure.
4. Confirm the browser offers **Install** (omnibox icon / menu), and the
   installed app launches standalone with the dovetail icon + slate theme.

## Notes / alternatives

- **Internal CA / self-signed** is possible but worse: every installing device
  must trust the CA manually, and mobile install is finicky with private certs.
  Prefer the real-cert + DNS-01 path above.
- No application code changes are required to finish TASK-020 — this is infra +
  env only. Keep TASK-020 `In Progress` until the Lighthouse check passes on the
  HTTPS origin, then move it to `done/`.
- If a real domain is not available at all, TASK-020 stays blocked at the
  deployment layer; the app layer is complete regardless.
```
