#!/usr/bin/env bash
# Opt-in local cleanup for machine-local artifacts.
#
# Usage:
#   scripts/clean-local-artifacts.sh --confirm
#
# Requires --confirm. Deletes from repo root only:
#   - .impeccable/
#   - .superpowers/
#   - docs/*.pdf
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CONFIRM=false
for arg in "$@"; do
  if [[ "$arg" == "--confirm" ]]; then
    CONFIRM=true
  fi
done

if [[ "$CONFIRM" != true ]]; then
  echo "Refusing to delete without --confirm. Re-run with: scripts/clean-local-artifacts.sh --confirm" >&2
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
  echo "No local artifacts found to delete."
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