#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

echo "==> Pulling latest changes..."
git pull origin master

echo "==> Installing server dependencies (build from source for native modules)..."
cd Server
npm ci --build-from-source
echo "==> Building server..."
npm run build
cd ..

echo "==> Installing client dependencies..."
cd Client
npm ci
echo "==> Building client..."
npm run build
cd ..

echo "==> Restarting server service..."
sudo systemctl restart doppelkopf-server

echo "==> Done. Server restarted successfully."
