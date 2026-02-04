# Offline Deployment Scripts

These scripts build gsworkspace for offline/browser-only deployment. The built app runs entirely in the browser using IndexedDB for storage - no backend server required.

## Prerequisites

- **Node.js 18+** - Download from https://nodejs.org/

## Quick Start

### Windows

```
build-windows.bat    # Install dependencies and build
test-windows.bat     # Preview the built app locally
```

### Linux

```bash
chmod +x build-linux.sh test-linux.sh
./build-linux.sh     # Install dependencies and build
./test-linux.sh      # Preview the built app locally
```

### macOS

```bash
chmod +x build-macos.sh test-macos.sh
./build-macos.sh     # Install dependencies and build
./test-macos.sh      # Preview the built app locally
```

## Output

After running the build script, the built app is in:
```
frontend/dist/
├── index.html
└── assets/
    ├── index-*.js
    └── index-*.css
```

## Deployment Options

### 1. Static Web Server

Copy the contents of `frontend/dist/` to any static web server (Apache, Nginx, S3, Netlify, Vercel, GitHub Pages, etc.)

### 2. Embed in Astro Site

Copy `frontend/dist/` contents to `public/gsworkspace/` in your Astro project, then either:

**Option A - Iframe:**
```html
<iframe src="/gsworkspace/index.html" style="width:100%; height:100%; border:none;"></iframe>
```

**Option B - Redirect:**
```html
<meta http-equiv="refresh" content="0; url=/gsworkspace/index.html" />
```

### 3. Subdirectory Deployment

If deploying to a subdirectory (e.g., `/app/`), edit `frontend/vite.config.ts` and set:
```typescript
base: '/app/',
```
Then rebuild with `npm run build`.

## Limitations in Offline Mode

| Feature | Available |
|---------|-----------|
| Create/edit scenes | Yes |
| Add text blocks | Yes |
| Add images (paste/drop) | Yes (stored as base64) |
| Add videos | Partial (blob URLs, lost on refresh) |
| Undo/redo | Yes |
| Export scene | Yes |
| LLM prompts | No (requires backend) |
| Image generation | No (requires backend) |
| Video editing | No (requires backend) |

## Storage Limits

Browser storage limits vary:
- **IndexedDB**: Usually 50 MB - 2 GB depending on browser
- Large images may hit these limits quickly

For media-heavy workspaces, consider the full local server deployment instead.
