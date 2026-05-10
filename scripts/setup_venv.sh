#!/usr/bin/env bash
# Create/update a local Python virtualenv and install repo dependencies.
#
# Usage (repo root — recommended):
#   bash scripts/setup_venv.sh
#   bash scripts/setup_venv.sh .venv
#
# Env override:
#   AGENTSENSE_VENV=.venv bash scripts/setup_venv.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REL="${AGENTSENSE_VENV:-${1:-venv}}"
VENV_ABS="$ROOT/$REL"

if [[ ! -x "$(command -v python3)" ]]; then
  echo "python3 not found on PATH." >&2
  exit 1
fi

cd "$ROOT"
if [[ ! -d "$VENV_ABS" ]]; then
  python3 -m venv "$VENV_ABS"
fi

PIP="$VENV_ABS/bin/pip"
PY="$VENV_ABS/bin/python"
"$PY" -m pip install --upgrade pip
"$PIP" install -r "$ROOT/requirements.txt"

echo ""
echo "Virtualenv ready at: $VENV_ABS"
echo "Activate:          source \"$REL/bin/activate\""
