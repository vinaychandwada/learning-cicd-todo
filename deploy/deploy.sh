#!/usr/bin/env bash
# Deploy script — runs on the self-hosted runner after every push to main.
# Builds both apps and (re)starts them under PM2.

set -euo pipefail

# Where we are: the runner checks out the repo into the current dir.
echo "==> Deploying from: $(pwd)"
echo "==> Commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'n/a')"

# -------------------------------------------------------------
# 1. Write the backend .env from environment variables
#    (the workflow YAML passes these in from GitHub Secrets)
# -------------------------------------------------------------
echo "==> Writing node/.env from secrets"
cat > node/.env <<EOF
PORT=${BACKEND_PORT:-5050}
MONGO_URI=${MONGO_URI}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=${JWT_EXPIRES_IN:-1d}
EOF

# -------------------------------------------------------------
# 2. Backend: install deps & build
# -------------------------------------------------------------
echo "==> Backend: installing dependencies"
(cd node && npm ci)

echo "==> Backend: building TypeScript -> dist/"
(cd node && npm run build)

# -------------------------------------------------------------
# 3. Frontend: install deps & build
# -------------------------------------------------------------
echo "==> Frontend: installing dependencies"
(cd react && npm ci)

echo "==> Frontend: building -> dist/"
(cd react && npm run build)

# -------------------------------------------------------------
# 4. Ensure 'serve' (static-file server for the React build) is installed
# -------------------------------------------------------------
if ! command -v serve >/dev/null 2>&1; then
  echo "==> Installing 'serve' globally (first time only)"
  sudo npm install -g serve
fi

# -------------------------------------------------------------
# 5. Start or reload apps in PM2
# -------------------------------------------------------------
echo "==> PM2: start-or-reload via ecosystem file"
pm2 startOrReload deploy/ecosystem.config.cjs --update-env

# -------------------------------------------------------------
# 6. Save PM2 state so apps survive reboots
# -------------------------------------------------------------
echo "==> PM2: saving process list"
pm2 save

echo "==> Deploy complete."
pm2 list
