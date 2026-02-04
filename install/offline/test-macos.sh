#!/bin/bash

echo "============================================"
echo "  gsworkspace Offline Test (macOS)"
echo "============================================"
echo

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Check if dist folder exists
if [ ! -d "$PROJECT_ROOT/frontend/dist" ]; then
    echo "ERROR: frontend/dist not found."
    echo "Please run ./build-macos.sh first to build the app."
    exit 1
fi

echo "Starting preview server..."
echo
echo "  The app will open at: http://localhost:4173"
echo
echo "  Press Ctrl+C to stop the server."
echo

# Open browser after a short delay
(sleep 2 && open http://localhost:4173 2>/dev/null) &

# Start Vite preview server
cd "$PROJECT_ROOT/frontend"
npm run preview
