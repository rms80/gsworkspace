#!/bin/bash

echo "============================================"
echo "  gsworkspace - Starting Local Server"
echo "============================================"
echo

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Check if backend .env exists
if [ ! -f "$PROJECT_ROOT/backend/.env" ]; then
    echo "ERROR: backend/.env not found."
    echo "Please run ./configure-macos.sh first."
    exit 1
fi

# Check if node_modules exist
if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    echo "ERROR: Root dependencies not installed."
    echo "Please run ./configure-macos.sh first."
    exit 1
fi

if [ ! -d "$PROJECT_ROOT/backend/node_modules" ]; then
    echo "ERROR: Backend dependencies not installed."
    echo "Please run ./configure-macos.sh first."
    exit 1
fi

if [ ! -d "$PROJECT_ROOT/frontend/node_modules" ]; then
    echo "ERROR: Frontend dependencies not installed."
    echo "Please run ./configure-macos.sh first."
    exit 1
fi

echo
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:4000"
echo
echo "  Press Ctrl+C to stop both servers."
echo

# Open browser after a short delay
(sleep 3 && open http://localhost:3000 2>/dev/null) &

# Start both servers in this terminal
cd "$PROJECT_ROOT"
npm run dev
