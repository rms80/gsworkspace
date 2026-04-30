#!/bin/bash
echo "Killing any existing process on port 4000..."
lsof -ti :4000 | xargs kill 2>/dev/null

echo "Starting backend dev server..."
cd "$(dirname "$0")/backend"
script -q /dev/null npx tsx watch src/index.ts 2>&1 | tee ../backend.log
