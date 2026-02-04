#!/bin/bash

echo "============================================"
echo "  gsworkspace Offline Build (Linux)"
echo "============================================"
echo

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Project root: $PROJECT_ROOT"
echo

# Check for Node.js
echo "Checking for Node.js..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH."
    echo "Please install Node.js from https://nodejs.org/"
    echo "Or use your package manager:"
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  Fedora: sudo dnf install nodejs npm"
    echo "  Arch: sudo pacman -S nodejs npm"
    echo "Recommended version: 18 or higher"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "Found Node.js $NODE_VERSION"
echo

# Check for npm
echo "Checking for npm..."
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not installed or not in PATH."
    exit 1
fi

NPM_VERSION=$(npm --version)
echo "Found npm $NPM_VERSION"
echo

# Install frontend dependencies
echo "============================================"
echo "Installing frontend dependencies..."
echo "============================================"
cd "$PROJECT_ROOT/frontend"
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install frontend dependencies."
    exit 1
fi
echo "Frontend dependencies installed successfully."
echo

# Clean and build the frontend to install/offline/dist
echo "============================================"
echo "Building frontend for offline use..."
echo "============================================"
if [ -d "$PROJECT_ROOT/install/offline/dist" ]; then
    echo "Cleaning previous build..."
    rm -rf "$PROJECT_ROOT/install/offline/dist"
fi
VITE_OFFLINE_MODE=true npm run build -- --outDir "$PROJECT_ROOT/install/offline/dist" --emptyOutDir
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to build frontend."
    exit 1
fi
echo

# Done
echo "============================================"
echo "  Build Complete!"
echo "============================================"
echo
echo "The offline build is located at:"
echo "  $PROJECT_ROOT/install/offline/dist/"
echo
echo "To test locally, run: ./test-linux.sh"
echo
echo "To deploy:"
echo "  1. Copy the contents of install/offline/dist/ to your web server"
echo "  2. Or embed in an Astro site (see DEPLOYMENT.md)"
echo
