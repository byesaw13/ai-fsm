#!/usr/bin/env bash
# Opt-in local cleanup for machine-local artifacts and generated PDFs.
#
# Usage:
#   scripts/clean-local-artifacts.sh --dry-run   # list targets, no deletes
#   scripts/clean-local-artifacts.sh --confirm   # delete listed targets
#
# Targets (repo root only):
#   - .impeccable/
#   - .superpowers/
#   - docs/*.pdf
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CONFIRM=false
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --confirm) CONFIRM=true ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

if [[ "$DRY_RUN" != true && "$CONFIRM" != true ]]; then
  echo "Refusing to run without --dry-run or --confirm." >&2
  echo "  scripts/clean-local-artifacts.sh --dry-run" >&2
  echo "  scripts/clean-local-artifacts.sh --confirm" >&2
  exit 1
fi

if [[ ! -f "$REPO_ROOT/package.json" ]]; then
  echo "ERROR: must be run from repo root (package.json not found)" >&2
  exit 1
fi

targets=()
[[ -d "$REPO_ROOT/.impeccable" ]] && targets+=("$REPO_ROOT/.impeccable")
[[ -d "$REPO_ROOT/.superpowers" ]] && targets+=("$REPO_ROOT/.superpowers")
while IFS= read -r -d '' pdf; do
  targets+=("$pdf")
done < <(find "$REPO_ROOT/docs" -maxdepth 1 -name '*.pdf' -print0 2>/dev/null || true)

if [[ ${#targets[@]} -eq 0 ]]; then
  echo "No local artifacts found."
  exit 0
fi

if [[ "$DRY_RUN" == true ]]; then
  echo "Dry run — would delete:"
  for target in "${targets[@]}"; do
    echo "  - $target"
  done
  exit 0
fi

echo "WARNING: This will permanently delete the following local artifacts:"
for target in "${targets[@]}"; do
  echo "  - $target"
done
echo

for target in "${targets[@]}"; do
  rm -rf "$target"
  echo "Deleted: $target"
done

echo "Local artifact cleanup complete."