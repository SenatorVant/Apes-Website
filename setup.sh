#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
#  setup.sh  —  One-shot server setup for Apes of Wrath 668
#  Run as a normal user (not root).  Tested on Ubuntu 22/24.
# ─────────────────────────────────────────────────────────
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "🦍  Apes of Wrath 668 — Backend Setup"
echo "========================================"

# 1. Check Node.js
if ! command -v node &>/dev/null; then
  echo "❌  Node.js not found. Install from https://nodejs.org (v18 or higher)."
  exit 1
fi
NODE_VER=$(node -e "process.stdout.write(process.version)")
echo "✅  Node.js $NODE_VER"

# 2. Install dependencies
echo ""
echo "📦  Installing npm dependencies..."
cd "$BACKEND_DIR"
npm install

# 3. Create .env if it doesn't exist
if [ ! -f .env ]; then
  echo ""
  echo "🔧  Creating .env from template..."
  cp .env.example .env
  # Generate a random JWT secret automatically
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
  sed -i "s/CHANGE_ME_to_a_long_random_string_at_least_64_chars/$JWT_SECRET/" .env
  echo "✅  .env created. Edit it to add your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
else
  echo "ℹ️   .env already exists — skipping."
fi

# 4. Create data & uploads dirs
mkdir -p data uploads public

# 5. Seed the database
echo ""
echo "🗄️   Setting up database..."
node src/db/seed.js

# 6. Done
echo ""
echo "✅  Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env and fill in your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"
echo "     (see README.md — 'Google OAuth Setup' section)"
echo "  2. Copy your HTML file to ./public/index.html"
echo "  3. Run the server:  npm start"
echo "     Or for auto-reload during development:  npm run dev"
echo ""
echo "The backend will be available at http://localhost:3001"
echo ""
