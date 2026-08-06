#!/bin/sh
# Runs the non-gating Flue eval slice.
#
# Usage:
#   ./eval.sh              run the deterministic checks, then all six cases
#   ./eval.sh okf-write    run the checks, then only cases whose id matches
#
# Put the credential and the model in `.env` (see README.md, "Credentials").
# `npm run eval` loads `.env` itself. This script does not read it.
#
# This eval slice is development tooling. It does not gate the release. The
# release gate is `node --test "test/*.test.js"` at the repository root.
set -eu

cd "$(dirname "$0")"

[ -d node_modules ] || npm install

npm run check

# A live case needs a credential. Without one it reports `blocked`, never a
# false pass, so the run is still safe to make. Say so once and continue.
if [ ! -f .env ] && [ ! -f ../.env ] && [ -z "${OPENCODE_API_KEY:-}${ANTHROPIC_API_KEY:-}" ]; then
  echo "eval.sh: no .env file and no provider key in the environment." >&2
  echo "eval.sh: the five activation cases will report 'blocked'." >&2
fi

npm run eval --silent -- "$@"
