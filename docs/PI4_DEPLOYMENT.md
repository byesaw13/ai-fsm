# Raspberry Pi 4 Deployment

## Recommended Hardware
- Raspberry Pi 4 (8GB preferred)
- External SSD for PostgreSQL data

## Steps
1. Install 64-bit Raspberry Pi OS.
2. Install Docker + Docker Compose plugin.
3. Copy project `.env` to Pi.
4. Pull ARM64 images.
5. Run: `docker compose -f infra/compose.pi.yml up -d`.

## Notes
- Keep swap enabled to reduce OOM risk.
- Limit concurrent workers.
- Use nightly DB backups to external storage.
