# Deployment Guide

## Storage Mode Configuration

The backend supports two storage modes:
- **online** - Uses AWS S3 for storing scenes and media
- **local** - Uses local filesystem (default: `~/.gsworkspace`)

### How Storage Mode is Determined

The storage mode is determined by this priority:

1. **Environment variable `STORAGE_MODE`** (if set) - always authoritative
2. **Persisted config file** `~/.gsworkspace/.storage-config.json` (if env var not set)
3. **Default** - `online`

### Cloud Deployments

For cloud deployments (AWS, GCP, Heroku, etc.), set the environment variable:

```bash
STORAGE_MODE=online
```

When `STORAGE_MODE` is set in the environment:
- The env var value is always used
- The config file is ignored
- Runtime changes via the API only affect memory (reset on restart)
- This ensures consistent behavior across deployments and instances

### Local Development / Self-Hosted

For local development or self-hosted deployments, you have two options:

**Option 1: Let the config file manage it (recommended for development)**

Remove or comment out `STORAGE_MODE` from your `.env` file. Then:
- Storage mode is loaded from `~/.gsworkspace/.storage-config.json` on startup
- Changes made via the Settings UI are persisted to this file
- Mode survives server restarts

**Option 2: Use environment variable**

Set `STORAGE_MODE=local` in your `.env` file for a fixed local-only setup.

### Switching Modes at Runtime

Users can switch storage modes via the Settings dialog in the UI. The behavior depends on deployment:

| Deployment Type | Runtime Change Behavior |
|-----------------|------------------------|
| Cloud (env var set) | Temporary - resets on restart |
| Local (no env var) | Persisted to config file |

### Required Environment Variables by Mode

**Online mode (S3):**
```bash
STORAGE_MODE=online  # optional if using default
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket
```

**Local mode:**
```bash
STORAGE_MODE=local
LOCAL_STORAGE_PATH=/path/to/storage  # optional, defaults to ~/.gsworkspace
```

### Frontend-Backend Synchronization

The frontend automatically syncs with the backend's storage mode:
- Health checks (every 5 seconds) include the current storage mode
- If a mismatch is detected (e.g., after backend restart), the frontend auto-syncs
- This prevents the UI from showing stale storage mode information

---

## Frontend-Only Offline Deployment (Astro)

The gsworkspace frontend can run entirely offline without a backend, using browser localStorage/IndexedDB for storage. This is useful for embedding in static sites like Astro.

### How Offline Mode Works

When the backend is unavailable:
- Scenes are stored in IndexedDB via localforage
- Images are stored as base64 data URLs
- Videos use blob URLs (lost on page refresh)
- Undo history is stored in IndexedDB
- No cloud sync, LLM features, or video editing (these require the backend)

### Building for Offline Deployment

1. **Build the frontend:**

```bash
cd frontend
npm install
npm run build
```

This creates a `dist/` folder with the built app.

2. **The built files include:**
   - `index.html` - main HTML file
   - `assets/` - JavaScript, CSS, and other assets

### Integrating with Astro

**Option 1: Embed as an iframe**

The simplest approach - host the built files and embed via iframe:

```astro
---
// src/pages/workspace.astro
---
<html>
  <head>
    <title>Workspace</title>
    <style>
      html, body { margin: 0; padding: 0; height: 100%; }
      iframe { width: 100%; height: 100%; border: none; }
    </style>
  </head>
  <body>
    <iframe src="/gsworkspace/index.html"></iframe>
  </body>
</html>
```

Copy the built `dist/` contents to `public/gsworkspace/` in your Astro project.

**Option 2: Copy build output to Astro public folder**

1. Copy the contents of `frontend/dist/` to your Astro project's `public/gsworkspace/` folder

2. Create a redirect or link to `/gsworkspace/index.html`

```astro
---
// src/pages/workspace.astro
---
<meta http-equiv="refresh" content="0; url=/gsworkspace/index.html" />
```

### Astro Configuration

If serving from a subdirectory, you may need to configure the base path. In `frontend/vite.config.ts`:

```typescript
export default defineConfig({
  base: '/gsworkspace/',
  // ... other config
})
```

Then rebuild the frontend.

### Limitations in Offline Mode

| Feature | Available Offline |
|---------|------------------|
| Create/edit scenes | ✅ Yes |
| Add text blocks | ✅ Yes |
| Add images (paste/drop) | ✅ Yes (stored as base64) |
| Add videos | ⚠️ Partial (blob URLs, lost on refresh) |
| Pan/zoom canvas | ✅ Yes |
| Undo/redo | ✅ Yes |
| Export scene | ✅ Yes |
| LLM prompts | ❌ No (requires backend) |
| Image generation | ❌ No (requires backend) |
| Video cropping/editing | ❌ No (requires backend) |
| Cloud sync | ❌ No (requires backend) |

### Storage Limits

Browser storage limits vary:
- **localStorage**: ~5-10 MB per origin
- **IndexedDB**: Usually 50 MB - 2 GB depending on browser and available disk space
- Large images/videos may hit these limits quickly

For production use with media-heavy workspaces, consider the full backend deployment.
