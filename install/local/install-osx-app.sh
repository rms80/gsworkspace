#!/bin/bash

echo "============================================"
echo "  gsworkspace - macOS App Installer"
echo "============================================"
echo

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

APP_NAME="gsworkspace"
APP_DIR="$HOME/Applications/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
APP_ROOT="$RESOURCES_DIR/app"

echo "Project root: $PROJECT_ROOT"
echo "Install to:   $APP_DIR"
echo

# ---- Check for Node.js ----

NODE_BIN=$(which node 2>/dev/null)
if [ -z "$NODE_BIN" ]; then
    for p in /opt/homebrew/bin/node /usr/local/bin/node; do
        [ -x "$p" ] && NODE_BIN="$p" && break
    done
fi

if [ -z "$NODE_BIN" ]; then
    echo "ERROR: Node.js is not installed or not in PATH."
    echo "Please install Node.js from https://nodejs.org/"
    echo "Or use Homebrew: brew install node"
    exit 1
fi

NODE_VERSION=$("$NODE_BIN" --version)
echo "Found Node.js $NODE_VERSION at $NODE_BIN"

# ---- Check for Xcode Command Line Tools ----

if ! xcode-select -p &>/dev/null; then
    echo "ERROR: Xcode Command Line Tools are not installed."
    echo "Install with: xcode-select --install"
    exit 1
fi
echo "Found Xcode Command Line Tools"

NPM_BIN="$(dirname "$NODE_BIN")/npm"
if [ ! -x "$NPM_BIN" ]; then
    NPM_BIN=$(which npm 2>/dev/null)
fi
if [ -z "$NPM_BIN" ] || [ ! -x "$NPM_BIN" ]; then
    echo "ERROR: npm not found."
    exit 1
fi
echo "Found npm at $NPM_BIN"
echo

# ---- Check dependencies are installed ----

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

# ---- Build frontend ----

echo "============================================"
echo "Building frontend..."
echo "============================================"
cd "$PROJECT_ROOT/frontend"
"$NPM_BIN" run build
if [ $? -ne 0 ]; then
    echo "ERROR: Frontend build failed."
    exit 1
fi
echo "Frontend build complete."
echo

# ---- Build backend ----

echo "============================================"
echo "Building backend..."
echo "============================================"
cd "$PROJECT_ROOT/backend"
"$NPM_BIN" run build
if [ $? -ne 0 ]; then
    echo "ERROR: Backend build failed."
    exit 1
fi
echo "Backend build complete."
echo

# ---- Create .app structure ----

echo "============================================"
echo "Creating app bundle..."
echo "============================================"

# Remove previous installation
if [ -d "$APP_DIR" ]; then
    echo "Removing previous installation..."
    rm -rf "$APP_DIR"
fi

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$APP_ROOT"

# ---- Copy frontend build ----

echo "Copying frontend build..."
mkdir -p "$APP_ROOT/frontend"
cp -r "$PROJECT_ROOT/frontend/dist" "$APP_ROOT/frontend/dist"

# ---- Copy backend ----

echo "Copying backend..."
mkdir -p "$APP_ROOT/backend"
cp -r "$PROJECT_ROOT/backend/dist" "$APP_ROOT/backend/dist"
cp "$PROJECT_ROOT/backend/package.json" "$APP_ROOT/backend/"
cp "$PROJECT_ROOT/backend/package-lock.json" "$APP_ROOT/backend/"

# Create a standalone .env (separate from the dev backend config)
cat > "$APP_ROOT/backend/.env" << 'ENVFILE'
PORT=4040
STORAGE_MODE=local
LOCAL_STORAGE_PATH=
GSWS_API_KEY_ANTHROPIC=
GSWS_API_KEY_GEMINI=
ENVFILE
echo "Created backend .env"

# ---- Install production dependencies ----

echo "Installing production dependencies..."
cd "$APP_ROOT/backend"
"$NPM_BIN" install --omit=dev 2>&1 | tail -3
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install production dependencies."
    rm -rf "$APP_DIR"
    exit 1
fi
echo

# ---- Strip non-macOS binaries ----

echo "Stripping unnecessary platform binaries..."

# Use Node's reported arch (not uname) since Node under Rosetta is x64 on arm64 hardware
NODE_ARCH=$("$NODE_BIN" -e "process.stdout.write(process.arch)")
if [ "$NODE_ARCH" = "arm64" ]; then
    KEEP_ARCH="arm64"
    REMOVE_ARCH="x64"
else
    KEEP_ARCH="x64"
    REMOVE_ARCH="arm64"
fi
echo "Node.js architecture: $NODE_ARCH (keeping $KEEP_ARCH binaries)"

# ffprobe-static: ships all platforms
FFPROBE_BIN="$APP_ROOT/backend/node_modules/ffprobe-static/bin"
if [ -d "$FFPROBE_BIN" ]; then
    rm -rf "$FFPROBE_BIN/linux" "$FFPROBE_BIN/win32"
    rm -rf "$FFPROBE_BIN/darwin/$REMOVE_ARCH"
    echo "  ffprobe-static: kept darwin/$KEEP_ARCH only"
fi

# ffmpeg-static: check if binary matches current arch
FFMPEG_BIN="$APP_ROOT/backend/node_modules/ffmpeg-static/ffmpeg"
if [ -f "$FFMPEG_BIN" ]; then
    FFMPEG_ARCH=$(file "$FFMPEG_BIN" | grep -o 'arm64\|x86_64')
    echo "  ffmpeg-static: $FFMPEG_ARCH binary ($(du -sh "$FFMPEG_BIN" | cut -f1) )"
fi

# sharp: remove other platform binaries
SHARP_VENDOR="$APP_ROOT/backend/node_modules/@img"
if [ -d "$SHARP_VENDOR" ]; then
    CURRENT_PLATFORM="sharp-darwin-$KEEP_ARCH"
    for dir in "$SHARP_VENDOR"/sharp-*/; do
        dirname=$(basename "$dir")
        # Only remove platform-specific sharp packages (sharp-* and sharp-libvips-*) for other platforms
        if [[ "$dirname" != *"darwin-$KEEP_ARCH"* ]]; then
            rm -rf "$dir"
            echo "  Removed @img/$dirname"
        fi
    done
fi

echo

# ---- Calculate final size ----

APP_SIZE=$(du -sh "$APP_DIR" | cut -f1)
echo "App bundle size: $APP_SIZE"
echo

# ---- Generate .icns icon ----

echo "Generating app icon..."

ICONSET_DIR=$(mktemp -d)/gsworkspace.iconset
mkdir -p "$ICONSET_DIR"

# Use sharp (from backend deps in the project) to render SVG to PNGs
SVG_PATH="$PROJECT_ROOT/frontend/public/favicon.svg"
if [ -f "$SVG_PATH" ]; then
    "$NODE_BIN" -e "
const sharp = require('$(echo "$PROJECT_ROOT/backend/node_modules/sharp" | sed "s/'/\\\\'/g")');
const fs = require('fs');
const svg = fs.readFileSync('$SVG_PATH');
const sizes = [16, 32, 64, 128, 256, 512, 1024];
const names = {
    16:  ['icon_16x16.png'],
    32:  ['icon_16x16@2x.png', 'icon_32x32.png'],
    64:  ['icon_32x32@2x.png'],
    128: ['icon_128x128.png'],
    256: ['icon_128x128@2x.png', 'icon_256x256.png'],
    512: ['icon_256x256@2x.png', 'icon_512x512.png'],
    1024:['icon_512x512@2x.png']
};
Promise.all(sizes.map(s =>
    sharp(svg, { density: Math.round(72 * s / 32) })
        .resize(s, s).png().toBuffer()
        .then(buf => names[s].forEach(n => fs.writeFileSync('$ICONSET_DIR/' + n, buf)))
)).then(() => console.log('Icon PNGs generated'))
  .catch(e => { console.error(e); process.exit(1); });
"
    if [ $? -eq 0 ]; then
        iconutil -c icns -o "$RESOURCES_DIR/gsworkspace.icns" "$ICONSET_DIR" 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "  Created gsworkspace.icns"
        else
            echo "  Warning: iconutil failed, app will use default icon"
        fi
    fi
    rm -rf "$(dirname "$ICONSET_DIR")"
else
    echo "  Warning: favicon.svg not found, app will use default icon"
fi
echo

# ---- Copy menu bar icon ----

echo "Copying menu bar icon..."
cp "$SCRIPT_DIR/menubar-icon.png" "$RESOURCES_DIR/menubar-icon.png" 2>/dev/null
cp "$SCRIPT_DIR/menubar-icon@2x.png" "$RESOURCES_DIR/menubar-icon@2x.png" 2>/dev/null

# ---- Create Info.plist ----

cat > "$CONTENTS_DIR/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>gsworkspace</string>
    <key>CFBundleIconFile</key>
    <string>gsworkspace</string>
    <key>CFBundleIdentifier</key>
    <string>com.gsworkspace.app</string>
    <key>CFBundleName</key>
    <string>gsworkspace</string>
    <key>CFBundleDisplayName</key>
    <string>gsworkspace</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

# ---- Compile native launcher ----

echo "Compiling native launcher..."
SWIFT_SRC="$SCRIPT_DIR/gsworkspace-launcher.swift"
if [ ! -f "$SWIFT_SRC" ]; then
    echo "ERROR: gsworkspace-launcher.swift not found."
    exit 1
fi

swiftc -o "$MACOS_DIR/gsworkspace" "$SWIFT_SRC" -framework Cocoa 2>&1
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to compile launcher. Xcode Command Line Tools required."
    echo "Install with: xcode-select --install"
    rm -rf "$APP_DIR"
    exit 1
fi
echo "  Launcher compiled."

# ---- Done ----

echo "============================================"
echo "  Installation Complete!"
echo "============================================"
echo
echo "Installed to: $APP_DIR"
echo "App size:     $APP_SIZE"
echo
echo "Launch gsworkspace from ~/Applications or Spotlight."
echo
if [ ! -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    echo "Note: Chrome not found. The app will open in your default browser."
    echo "Install Chrome for app-mode (frameless window) experience."
    echo
fi
echo "To configure API keys, edit:"
echo "  $APP_ROOT/backend/.env"
echo
