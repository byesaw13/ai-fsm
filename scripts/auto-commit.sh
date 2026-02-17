#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=false
DO_PUSH=false
NO_STAGE=false
TYPE_OVERRIDE=""
SCOPE_OVERRIDE=""

usage() {
  cat <<'USAGE'
Usage: scripts/auto-commit.sh [options]

Options:
  --dry-run         Show generated commit message without committing
  --push            Push after commit
  --no-stage        Do not run git add -A (use already staged changes)
  --type TYPE       Override commit type (feat|fix|docs|chore|test|refactor)
  --scope SCOPE     Override commit scope
  -h, --help        Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --push) DO_PUSH=true ;;
    --no-stage) NO_STAGE=true ;;
    --type) TYPE_OVERRIDE="${2:-}"; shift ;;
    --scope) SCOPE_OVERRIDE="${2:-}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
  shift
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not inside a git repository."
  exit 1
fi

if [[ "$NO_STAGE" == false && "$DRY_RUN" == false ]]; then
  git add -A
fi

if git diff --cached --quiet; then
  echo "No staged changes to commit."
  exit 0
fi

mapfile -t FILES < <(git diff --cached --name-only)
SHORTSTAT="$(git diff --cached --shortstat || true)"

category_for_file() {
  local f="$1"
  case "$f" in
    docs/*|*.md) echo "docs" ;;
    apps/web/*) echo "web" ;;
    services/api/*) echo "api" ;;
    services/worker/*) echo "worker" ;;
    db/migrations/*) echo "db" ;;
    packages/domain/*) echo "domain" ;;
    infra/*|Dockerfile*|docker-compose*|compose*.yml) echo "infra" ;;
    .github/workflows/*) echo "ci" ;;
    scripts/*) echo "scripts" ;;
    *test*|*spec*|__tests__/*) echo "tests" ;;
    *) echo "misc" ;;
  esac
}

declare -A CAT_COUNTS=()
for f in "${FILES[@]}"; do
  c="$(category_for_file "$f")"
  CAT_COUNTS["$c"]=$(( ${CAT_COUNTS["$c"]:-0} + 1 ))
done

mapfile -t CATS < <(printf "%s\n" "${!CAT_COUNTS[@]}" | sort)

pick_type() {
  if [[ -n "$TYPE_OVERRIDE" ]]; then
    echo "$TYPE_OVERRIDE"
    return
  fi

  local only_docs=true
  local has_product=false
  local has_tests=false

  for c in "${CATS[@]}"; do
    [[ "$c" != "docs" ]] && only_docs=false
    [[ "$c" == "web" || "$c" == "api" || "$c" == "worker" || "$c" == "db" || "$c" == "domain" ]] && has_product=true
    [[ "$c" == "tests" ]] && has_tests=true
  done

  if [[ "$only_docs" == true ]]; then
    echo "docs"
  elif [[ "$has_product" == true ]]; then
    echo "feat"
  elif [[ "$has_tests" == true ]]; then
    echo "test"
  else
    echo "chore"
  fi
}

pick_scope() {
  if [[ -n "$SCOPE_OVERRIDE" ]]; then
    echo "$SCOPE_OVERRIDE"
    return
  fi

  local best_cat="misc"
  local best_count=0
  for c in "${!CAT_COUNTS[@]}"; do
    if (( CAT_COUNTS["$c"] > best_count )); then
      best_cat="$c"
      best_count=${CAT_COUNTS["$c"]}
    fi
  done
  echo "$best_cat"
}

join_by() {
  local IFS="$1"
  shift
  echo "$*"
}

TYPE="$(pick_type)"
SCOPE="$(pick_scope)"

mapfile -t TOP_CATS < <(printf "%s\n" "${CATS[@]}" | head -n 3)
TOP_CATS_TEXT="$(join_by ", " "${TOP_CATS[@]}")"
FILE_COUNT="${#FILES[@]}"

TITLE="${TYPE}(${SCOPE}): update ${TOP_CATS_TEXT}"

BODY=$(cat <<BODYEOF
Auto-generated commit message by scripts/auto-commit.sh.

Summary:
- Files changed: ${FILE_COUNT}
- Diff stats: ${SHORTSTAT:-n/a}
- Areas: ${TOP_CATS_TEXT}

Changed files:
BODYEOF
)

for f in "${FILES[@]:0:12}"; do
  BODY+=$'\n- '
  BODY+="$f"
done

if (( FILE_COUNT > 12 )); then
  BODY+=$'\n- ...'
fi

if [[ "$DRY_RUN" == true ]]; then
  echo "[dry-run] git commit -m \"$TITLE\" -m \"<body>\""
  echo
  echo "$TITLE"
  echo
  echo "$BODY"
  exit 0
fi

git commit -m "$TITLE" -m "$BODY"

echo "Committed: $TITLE"

if [[ "$DO_PUSH" == true ]]; then
  git push
  echo "Pushed to remote."
fi
