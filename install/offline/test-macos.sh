#!/bin/bash

echo "============================================"
echo "  gsworkspace Offline Test (macOS)"
echo "============================================"
echo

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if dist folder exists
if [ ! -d "$SCRIPT_DIR/dist" ]; then
    echo "ERROR: dist folder not found."
    echo "Please run ./build-macos.sh first to build the app."
    exit 1
fi

echo "Starting preview server..."
echo
echo "  The app will open at: http://localhost:3000"
echo
echo "  Press Ctrl+C to stop the server."
echo

# Open browser after a short delay
(sleep 2 && open http://localhost:3000 2>/dev/null) &

# Start static server
cd "$SCRIPT_DIR"
npx -y serve dist -l 3000
