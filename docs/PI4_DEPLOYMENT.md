# Raspberry Pi 4 Deployment (Secondary / Legacy)

> **Status:** Secondary target. The primary deployment target is `garonhome.local` (x86).
> For the full and current deployment runbook, see [docs/DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md).
> These notes are kept for Pi-specific hardware reference and fallback use.

## Recommended Hardware
- Raspberry Pi 4 (8GB preferred)
- External SSD for PostgreSQL data (SD cards wear out quickly under DB writes)

## Steps
1. Install 64-bit Raspberry Pi OS.
2. Install Docker + Docker Compose plugin.
3. Copy project `.env` to Pi and fill all required vars (see DEPLOYMENT_RUNBOOK.md).
4. Pull ARM64 images.
5. Run: `docker compose -f infra/compose.pi.yml up -d`.
6. Apply migrations manually on first deploy (see DEPLOYMENT_RUNBOOK.md — Pi section).

## Notes
- Keep swap ≥ 1 GB enabled to reduce OOM risk.
- Set `WORKER_CONCURRENCY=1` and `NODE_OPTIONS=--max-old-space-size=256`.
- Use nightly DB backups to external storage.
- Architecture: `linux/arm64`. All images must be ARM64.
