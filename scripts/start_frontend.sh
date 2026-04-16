#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/dynamos/smartbmi-ui"
LOCK_FILE="/tmp/smartbmi-frontend.lock"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Smart BMI frontend is already running. Exiting."
  exit 0
fi

cd "${APP_DIR}"

if [[ -x "${APP_DIR}/.venv/bin/python" ]]; then
  exec "${APP_DIR}/.venv/bin/python" "${APP_DIR}/scripts/serve_dist.py" --dir "${APP_DIR}/dist" --host 0.0.0.0 --port 4173
fi

exec /usr/bin/python3 "${APP_DIR}/scripts/serve_dist.py" --dir "${APP_DIR}/dist" --host 0.0.0.0 --port 4173
