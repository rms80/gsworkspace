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
