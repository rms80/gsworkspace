#!/bin/bash

echo "============================================"
echo "  gsworkspace Local Configuration (macOS)"
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
    echo "Or use Homebrew: brew install node"
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

# Install all dependencies (root, backend, frontend)
echo "============================================"
echo "Installing dependencies..."
echo "============================================"
cd "$PROJECT_ROOT"
npm run install:all
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies."
    exit 1
fi
echo "All dependencies installed successfully."
echo

# Configure backend .env
echo "============================================"
echo "Configuring backend environment..."
echo "============================================"
cd "$PROJECT_ROOT/backend"

if [ -f ".env" ]; then
    echo "Backend .env already exists, skipping..."
else
    echo "Creating backend .env for local storage mode..."
    cat > .env << 'EOF'
# Backend Configuration
PORT=4000

# Storage mode: 'local' for local disk storage
STORAGE_MODE=local

# Local storage path (defaults to ~/.gsworkspace if empty)
LOCAL_STORAGE_PATH=

# AI API Keys (optional - leave empty to disable AI features)
GSWS_API_KEY_ANTHROPIC=
GSWS_API_KEY_GEMINI=
EOF
    echo "Backend .env created."
fi
echo

# Configure frontend .env.local
echo "============================================"
echo "Configuring frontend environment..."
echo "============================================"
cd "$PROJECT_ROOT/frontend"

if [ -f ".env.local" ]; then
    echo "Frontend .env.local already exists, skipping..."
else
    echo "Creating frontend .env.local..."
    cat > .env.local << 'EOF'
VITE_OFFLINE_MODE=false

# Use production favicon instead of dev favicon
VITE_PROD_FAVICON=true

# Frontend server port (default: 3000)
VITE_PORT=3000

# Backend API port - must match PORT in backend/.env (default: 4000)
VITE_API_PORT=4000
EOF
    echo "Frontend .env.local created."
fi
echo

# Done
echo "============================================"
echo "  Configuration Complete!"
echo "============================================"
echo
echo "To start the app, run: ./launch-macos.sh"
echo
echo "Optional: Add your API keys to backend/.env"
echo "  - GSWS_API_KEY_ANTHROPIC for Claude AI features"
echo "  - GSWS_API_KEY_GEMINI for Gemini/Imagen features"
echo
