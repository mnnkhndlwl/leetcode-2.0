#!/usr/bin/env bash
# local-judge.sh — run a JavaScript solution against local test cases
# using exactly the same Docker sandbox the production judge worker uses.
#
# Usage:
#   ./scripts/local-judge.sh <path/to/solution.js> [path/to/cases.json]
#
# Defaults:
#   cases.json → test-cases/two-sum.json
#
# The solution file MUST be named solution.js (the judge worker mounts
# the containing directory at /code and executes /code/solution.js).
#
# Test-case JSON schema (same as S3):
#   [ { "id": 1, "input": "line1\nline2", "expectedOutput": "result" }, ... ]
#
# Example:
#   ./scripts/local-judge.sh test-cases/solutions/two-sum/solution.js \
#                            test-cases/two-sum.json

set -euo pipefail

# ── Colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ── Args ───────────────────────────────────────────────────────────────────────
SOLUTION="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CASES="${2:-$SCRIPT_DIR/../test-cases/two-sum.json}"

if [[ -z "$SOLUTION" ]]; then
  echo -e "${RED}Usage: $0 <solution.js> [test-cases.json]${RESET}"
  exit 1
fi

SOLUTION="$(realpath "$SOLUTION")"
CASES="$(realpath "$CASES")"
CODE_DIR="$(dirname "$SOLUTION")"
FILENAME="$(basename "$SOLUTION")"

# ── Validate filename ──────────────────────────────────────────────────────────
if [[ "$FILENAME" != "solution.js" ]]; then
  echo -e "${RED}ERROR: file must be named solution.js${RESET}"
  echo "       (judge worker mounts the parent dir and runs /code/solution.js)"
  exit 1
fi

# ── Settings (mirror judge worker defaults) ────────────────────────────────────
IMAGE="judge-javascript:latest"
TIME_LIMIT_MS=2000
MEMORY_LIMIT_MB=256
WALL_CLOCK_S=$(( (TIME_LIMIT_MS + 2000) / 1000 ))   # +2 s grace, same as Go code

# ── Build image if missing ─────────────────────────────────────────────────────
if ! docker image inspect "$IMAGE" &>/dev/null; then
  echo -e "${CYAN}${BOLD}Building $IMAGE …${RESET}"
  docker build -t "$IMAGE" "$SCRIPT_DIR/../images/javascript/" --quiet
  echo -e "${GREEN}Built $IMAGE${RESET}"
else
  echo -e "${CYAN}Using cached $IMAGE${RESET}"
fi

# ── Verify jq is available ────────────────────────────────────────────────────
if ! command -v jq &>/dev/null; then
  echo -e "${RED}ERROR: jq is required. Install with: brew install jq${RESET}"
  exit 1
fi

# ── Cross-platform timeout helper ─────────────────────────────────────────────
# macOS ships BSD timeout-less coreutils; GNU coreutils' timeout is 'gtimeout'.
_timeout() {
  if command -v gtimeout &>/dev/null; then
    gtimeout "$@"
  elif command -v timeout &>/dev/null; then
    timeout "$@"
  else
    # No timeout binary: skip the wrapper (docker --stop-timeout still fires)
    local _secs="$1"; shift
    "$@"
  fi
}

# ── Run test cases ─────────────────────────────────────────────────────────────
TOTAL=$(jq 'length' "$CASES")
PASS=0
FAIL=0
ERRORS=()

echo ""
echo -e "${BOLD}Judge: $IMAGE${RESET}"
echo -e "${BOLD}Solution: $SOLUTION${RESET}"
echo -e "${BOLD}Cases: $CASES  ($TOTAL test case(s))${RESET}"
echo "──────────────────────────────────────────────────────────"

for i in $(seq 0 $(( TOTAL - 1 ))); do
  ID=$(jq -r ".[$i].id" "$CASES")
  # jq outputs \n as a literal newline when using -r
  INPUT=$(jq -r ".[$i].input" "$CASES")
  EXPECTED=$(jq -r ".[$i].expectedOutput" "$CASES")

  STDERR_FILE=$(mktemp)
  START_NS=$(date +%s%N 2>/dev/null || echo 0)

  # Exact same docker run flags as judge worker (judge.go:runTestCase)
  ACTUAL=$(
    printf '%s' "$INPUT" | \
    _timeout "$WALL_CLOCK_S" \
    docker run --rm -i \
      --network none \
      --memory="${MEMORY_LIMIT_MB}m" \
      --cpus=0.5 \
      --read-only \
      --tmpfs /tmp \
      -v "${CODE_DIR}:/code:ro" \
      "$IMAGE" \
      2>"$STDERR_FILE" \
    || true
  )

  END_NS=$(date +%s%N 2>/dev/null || echo 0)
  RUNTIME_MS=$(( (END_NS - START_NS) / 1000000 ))

  # Trim whitespace for comparison (same as Go: strings.TrimSpace)
  ACTUAL_T=$(echo "$ACTUAL"   | tr -d '[:space:]')
  EXPECT_T=$(echo "$EXPECTED" | tr -d '[:space:]')

  if [[ "$ACTUAL_T" == "$EXPECT_T" ]]; then
    echo -e "  ${GREEN}✅ Test $ID PASSED${RESET}  (${RUNTIME_MS}ms)"
    PASS=$(( PASS + 1 ))
  else
    echo -e "  ${RED}❌ Test $ID FAILED${RESET}  (${RUNTIME_MS}ms)"
    # Show trimmed input (first two lines) for context
    INPUT_PREVIEW=$(printf '%s' "$INPUT" | head -2 | paste -sd ' ' -)
    echo -e "     ${BOLD}Input:${RESET}    $INPUT_PREVIEW"
    echo -e "     ${BOLD}Expected:${RESET} $EXPECTED"
    echo -e "     ${BOLD}Got:${RESET}      ${ACTUAL:-<no output>}"
    STDERR_CONTENT=$(cat "$STDERR_FILE" 2>/dev/null || true)
    if [[ -n "$STDERR_CONTENT" ]]; then
      echo -e "     ${YELLOW}Stderr:${RESET}   $(echo "$STDERR_CONTENT" | head -3)"
    fi
    FAIL=$(( FAIL + 1 ))
    ERRORS+=("Test $ID")
  fi

  rm -f "$STDERR_FILE"
done

# ── Summary ────────────────────────────────────────────────────────────────────
echo "──────────────────────────────────────────────────────────"
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}🎉  $PASS / $TOTAL passed — Accepted!${RESET}"
else
  echo -e "${RED}${BOLD}💥  $PASS / $TOTAL passed — $FAIL failed${RESET}"
fi
echo ""

[[ $FAIL -eq 0 ]]
