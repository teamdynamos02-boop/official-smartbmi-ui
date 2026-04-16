#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/dynamos/smartbmi-ui"
LOCK_FILE="/tmp/smartbmi-backend.lock"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Smart BMI backend is already running. Exiting."
  exit 0
fi

cd "${APP_DIR}"

if [[ -x "${APP_DIR}/.venv/bin/waitress-serve" ]]; then
  exec "${APP_DIR}/.venv/bin/waitress-serve" --host=0.0.0.0 --port=5000 app:app
elif [[ -x "${APP_DIR}/.venv/bin/python3" ]]; then
  exec "${APP_DIR}/.venv/bin/python3" app.py
elif [[ -x "${APP_DIR}/.venv/bin/python" ]]; then
  exec "${APP_DIR}/.venv/bin/python" app.py
else
  exec /usr/bin/python3 app.py
fi
