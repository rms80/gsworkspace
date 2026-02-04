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

# Create a file to track PIDs for cleanup
PID_FILE="/tmp/gsworkspace-pids-$$"

cleanup() {
    echo
    echo "Shutting down servers..."
    if [ -f "$PID_FILE" ]; then
        while read pid; do
            kill $pid 2>/dev/null
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi
    echo "Servers stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM

echo "Starting backend server..."
cd "$PROJECT_ROOT/backend"
npm run dev &
BACKEND_PID=$!
echo $BACKEND_PID >> "$PID_FILE"

# Wait for backend to start
sleep 2

echo "Starting frontend server..."
cd "$PROJECT_ROOT/frontend"
npm run dev &
FRONTEND_PID=$!
echo $FRONTEND_PID >> "$PID_FILE"

# Wait for frontend to be ready
sleep 3

echo
echo "============================================"
echo "  Servers are running!"
echo "============================================"
echo
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:4000"
echo
echo "  Press Ctrl+C to stop both servers."
echo

# Open browser on macOS
open http://localhost:3000 2>/dev/null &

# Wait for processes
wait
