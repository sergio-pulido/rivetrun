#!/usr/bin/env bash
# RivetRun QA gate (owner: [MASTER], docs/OVERNIGHT.md).
#
#   scripts/qa.sh                 gate the committed HEAD of this checkout
#   scripts/qa.sh --tag           ... and on green, tag it demo-good-<HHMM> and push the tag
#   scripts/qa.sh --demo-build    ... and also run `pnpm demo:stable -- --build-only` (hourly; skipped while :3001 serves)
#   scripts/qa.sh --ref <ref>     gate another commit            --no-e2e / --no-build  skip those steps
#
# What a green run certifies:
#   - Every step runs on a clean worktree of the commit under test (../rivetrun-qa), so nothing uncommitted in this
#     checkout can help it pass: install, typecheck, unit tests, sim determinism, balance, production build.
#   - The e2e smoke (e2e/smoke.mjs) runs against that production build, served by `next start` on 127.0.0.1:3100
#     (loopback only) for the length of the smoke and then stopped. Reason: the dev server on :3000 hot-reloads on
#     every save by five sessions and resets a run every few seconds, so a smoke on it says nothing about a commit.
#     QA_SERVER=dev runs the smoke on the dev server instead.
# It never touches :3000 or :3001 and never writes to this checkout outside e2e/out and e2e/screens.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QA_TREE="${QA_TREE:-$ROOT/../rivetrun-qa}"
QA_SERVER="${QA_SERVER:-build}"
QA_PORT="${QA_PORT:-3100}"
if [ "$QA_SERVER" = dev ]; then BASE_URL="${QA_BASE_URL:-http://localhost:3000}"; else BASE_URL="http://127.0.0.1:$QA_PORT"; fi
REF="HEAD"
TAG=0
DEMO_BUILD=0
RUN_E2E=1
RUN_BUILD=1
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="$2"; shift ;;
    --tag) TAG=1 ;;
    --demo-build) DEMO_BUILD=1 ;;
    --no-e2e) RUN_E2E=0 ;;
    --no-build) RUN_BUILD=0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

SHA="$(git -C "$ROOT" rev-parse "$REF^{commit}")" || exit 2
SHORT="${SHA:0:7}"
STAMP="$(date +%H%M)"
OUT="$ROOT/e2e/out/$STAMP"
SCREENS="$ROOT/e2e/screens/$STAMP"
mkdir -p "$OUT"
TSX="node_modules/.pnpm/node_modules/.bin/tsx"

FAILED=()
SKIPPED=()
NOTES=()

# run <name> <dir> <command...>: one step, full output in $OUT/<name>.log, the tail on failure.
run() {
  local name="$1" dir="$2"
  shift 2
  local log="$OUT/$name.log" started=$SECONDS
  if (cd "$dir" && "$@") >"$log" 2>&1; then
    printf 'PASS %-14s %3ds\n' "$name" "$((SECONDS - started))"
    return 0
  fi
  printf 'FAIL %-14s %3ds   log: %s\n' "$name" "$((SECONDS - started))" "$log"
  tail -n 25 "$log" | sed 's/^/     | /'
  FAILED+=("$name")
  return 1
}

sync_tree() {
  if [ ! -e "$QA_TREE/.git" ]; then
    git -C "$ROOT" worktree add --detach "$QA_TREE" "$SHA"
  else
    # The QA worktree holds no work of its own: anything changed there is a leftover of the last run.
    git -C "$QA_TREE" checkout --detach --force "$SHA"
  fi
}

determinism() {
  "$TSX" scripts/balance.ts --seeds 2 >"$OUT/balance.txt" 2>&1 || return 1
  "$TSX" scripts/balance.ts --seeds 2 >"$OUT/balance-again.txt" 2>&1 || return 1
  cmp "$OUT/balance.txt" "$OUT/balance-again.txt" && echo "two runs of the balance table are identical"
}

# Every mission must be finished by at least one core build within budget, and the default build must finish M1
# (the 60-second path).
balance() {
  local solved
  solved="$(sed -n '/^Solved by/,$p' "$OUT/balance.txt")"
  echo "$solved"
  [ -n "$solved" ] || { echo "no 'Solved by' block in the balance table"; return 1; }
  if echo "$solved" | grep -q 'NONE'; then echo "a mission is solved by no core build"; return 1; fi
  echo "$solved" | grep -E '^ +M1:' | grep -q 'all_rounder' || { echo "the default build (all_rounder) does not finish M1"; return 1; }
}

run_smoke() {
  [ -d "$ROOT/e2e/node_modules/playwright-core" ] || (cd "$ROOT/e2e" && npm ci --no-audit --no-fund) || return 1
  if QA_BASE_URL="$BASE_URL" QA_SCREENS="$SCREENS" node "$ROOT/e2e/smoke.mjs"; then return 0; fi
  echo "--- first attempt failed; retrying in 20 s ---"
  sleep 20
  QA_BASE_URL="$BASE_URL" QA_SCREENS="$SCREENS-retry" node "$ROOT/e2e/smoke.mjs"
}

# The smoke on the production build of the commit: serve it on loopback, run, stop.
smoke_build() {
  if lsof -nP -iTCP:"$QA_PORT" -sTCP:LISTEN >/dev/null 2>&1; then echo "port $QA_PORT is already in use"; return 1; fi
  [ -f "$QA_TREE/apps/web/.next/BUILD_ID" ] || { echo "no production build in $QA_TREE/apps/web/.next (the build step did not pass)"; return 1; }
  # Jev's key goes to the server process only: read from .env.local, never written, printed or logged.
  local key=""
  if [ -f "$ROOT/apps/web/.env.local" ]; then
    key="$(grep -E '^JEV_API_KEY=' "$ROOT/apps/web/.env.local" | head -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
  fi
  [ -n "$key" ] || echo "note: no JEV_API_KEY, the heuristic will drive (FALLBACK)"
  # RIVETRUN_JEV_FAULT_SWITCH=1 lets the smoke ask this server (and only this one) to fail Jev for one browser
  # context, to drive the FALLBACK path. The demo build never sets it.
  (cd "$QA_TREE/apps/web" && JEV_API_KEY="$key" RIVETRUN_JEV_FAULT_SWITCH=1 exec node node_modules/next/dist/bin/next start -H 127.0.0.1 -p "$QA_PORT") >"$OUT/server.log" 2>&1 &
  local server=$!
  trap 'kill "$server" 2>/dev/null' EXIT
  local waited=0
  until curl -s -o /dev/null --max-time 2 "$BASE_URL/"; do
    waited=$((waited + 1))
    if [ "$waited" -gt 40 ] || ! kill -0 "$server" 2>/dev/null; then echo "the QA server did not come up"; tail -n 20 "$OUT/server.log"; return 1; fi
    sleep 1
  done
  run_smoke
  local status=$?
  kill "$server" 2>/dev/null
  wait "$server" 2>/dev/null
  return "$status"
}

smoke_dev() {
  curl -s -o /dev/null --max-time 20 "$BASE_URL/" || { echo "dev server at $BASE_URL does not answer"; return 1; }
  run_smoke
}

echo "QA $STAMP · commit $SHORT ($(git -C "$ROOT" log -1 --format=%s "$SHA" | cut -c1-70))"

if run worktree "$ROOT" sync_tree && run install "$QA_TREE" pnpm install --frozen-lockfile --prefer-offline; then
  run typegen "$QA_TREE/apps/web" pnpm exec next typegen
  run typecheck "$QA_TREE" pnpm -s exec turbo run typecheck --continue
  run unit-tests "$QA_TREE" pnpm -s exec turbo run test --continue
  if run determinism "$QA_TREE" determinism; then
    run balance "$QA_TREE" balance
    if [ -f "$ROOT/e2e/out/balance-last.txt" ] && ! cmp -s "$OUT/balance.txt" "$ROOT/e2e/out/balance-last.txt"; then
      NOTES+=("balance table changed since the last run: diff $ROOT/e2e/out/balance-last.txt $OUT/balance.txt")
    fi
    cp "$OUT/balance.txt" "$ROOT/e2e/out/balance-last.txt"
  fi
  if [ "$RUN_BUILD" = 1 ]; then
    run build "$QA_TREE/apps/web" env NEXT_DIST_DIR=.next pnpm exec next build
  else
    SKIPPED+=("build")
  fi
fi

if [ "$RUN_E2E" = 1 ]; then
  if [ "$QA_SERVER" = dev ]; then
    DIRTY="$(git -C "$ROOT" status --porcelain --untracked-files=all -- apps/web/app apps/web/src packages scripts | grep -c . || true)"
    E2E_ON="the dev server on :3000 ($DIRTY uncommitted source file(s) in the checkout)"
    run e2e "$ROOT" smoke_dev
  else
    E2E_ON="a production build of $SHORT served on 127.0.0.1:$QA_PORT"
    run e2e "$ROOT" smoke_build
  fi
  grep -E '^(PASS|FAIL|SKIP|WARN) ' "$OUT/e2e.log" | sed 's/^/     /'
  NOTES+=("e2e ran on $E2E_ON; screens: $SCREENS")
else
  SKIPPED+=("e2e")
fi

if [ "$DEMO_BUILD" = 1 ]; then
  if lsof -nP -iTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
    SKIPPED+=("demo-build")
    NOTES+=("demo build skipped: something is serving on :3001 and the build would replace the build it serves")
  else
    run demo-build "$ROOT" pnpm demo:stable -- --build-only
  fi
fi

for note in ${NOTES[@]+"${NOTES[@]}"}; do echo "NOTE $note"; done
[ ${#SKIPPED[@]} -eq 0 ] || echo "SKIPPED ${SKIPPED[*]}"

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "QA RED $SHORT · failed: ${FAILED[*]} · logs: $OUT"
  exit 1
fi
echo "QA GREEN $SHORT · logs: $OUT"

if [ "$TAG" = 1 ]; then
  if [ ${#SKIPPED[@]} -gt 0 ] && [ "${SKIPPED[*]}" != "demo-build" ]; then
    echo "not tagging: a gate step was skipped (${SKIPPED[*]})"
    exit 0
  fi
  EXISTING="$(git -C "$ROOT" tag --points-at "$SHA" --list 'demo-good-*' | head -n 1)"
  if [ -n "$EXISTING" ]; then
    echo "already tagged: $EXISTING"
    exit 0
  fi
  git -C "$ROOT" fetch --quiet origin main
  if ! git -C "$ROOT" merge-base --is-ancestor "$SHA" origin/main; then
    echo "not tagging: $SHORT is not on origin/main yet (push first)"
    exit 0
  fi
  NAME="demo-good-$(date +%H%M)"
  git -C "$ROOT" tag -a "$NAME" "$SHA" -m "QA green $(date '+%Y-%m-%d %H:%M'): typecheck, unit tests, sim determinism, balance and production build on a clean worktree of $SHORT; e2e smoke on $E2E_ON." &&
    git -C "$ROOT" push --quiet origin "$NAME" &&
    echo "TAGGED $NAME → $SHORT"
fi
