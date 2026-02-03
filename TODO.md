# TODO: Local Disk Storage Mode

## Overview

Add a "local disk" storage mode alongside the existing S3 (online) and IndexedDB (offline/browser) modes. Users can dynamically switch between:

1. **online/s3** - Current S3-based cloud storage
2. **local/disk** - New local filesystem storage via the backend
3. **offline/browser** - Current IndexedDB browser storage

Default local folder: `~/.gsworkspace`
Configurable via: `LOCAL_STORAGE_PATH` in backend `.env`

---

## Architecture

### Storage Modes

| Mode | Backend | Frontend | Data Location |
|------|---------|----------|---------------|
| `online` | S3 service | ApiStorageProvider | S3 bucket |
| `local` | Disk service | ApiStorageProvider | `~/.gsworkspace/` |
| `offline` | N/A | LocalStorageProvider | Browser IndexedDB |

**Key insight:** The `local` mode still uses `ApiStorageProvider` on the frontend - the backend handles the switch between S3 and disk. Only `offline` mode bypasses the backend entirely.

### Folder Structure (Local Mode)

```
~/.gsworkspace/
├── temp/
│   ├── images/           # Staging area for uploaded images
│   └── videos/           # Staging area for uploaded videos
└── scenes/
    └── {sceneId}/
        ├── scene.json    # Scene metadata + items
        ├── history.json  # Undo/redo history
        ├── {itemId}.png  # Image files
        ├── {itemId}.mp4  # Video files
        └── {itemId}.html # HTML content
```

---

## Implementation Plan

### Phase 1: Backend Disk Storage Service

#### Task 1.1: Create `diskStorage.ts` service
**File:** `backend/src/services/diskStorage.ts`

Implement functions mirroring `s3.ts`:
- `saveToDisk(key: string, data: string | Buffer, contentType?: string): Promise<void>`
- `loadFromDisk(key: string): Promise<string | null>`
- `loadFromDiskAsBuffer(key: string): Promise<Buffer | null>`
- `listFromDisk(prefix: string): Promise<string[]>`
- `deleteFromDisk(key: string): Promise<void>`
- `existsOnDisk(key: string): Promise<boolean>`
- `getLocalUrl(key: string): string` - returns `/api/local-files/{key}`

Implementation details:
- Use `fs.promises` for all operations
- Resolve `~` to user home directory via `os.homedir()`
- Create directories recursively with `fs.mkdir({ recursive: true })`
- Handle path separators cross-platform with `path.join()`

#### Task 1.2: Create storage abstraction layer
**File:** `backend/src/services/storage.ts`

Create unified interface that delegates to S3 or disk:
```typescript
interface StorageService {
  save(key: string, data: string | Buffer, contentType?: string): Promise<void>
  load(key: string): Promise<string | null>
  loadAsBuffer(key: string): Promise<Buffer | null>
  list(prefix: string): Promise<string[]>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  getPublicUrl(key: string): string
}

function getStorageService(): StorageService
function getStorageMode(): 'online' | 'local'
```

#### Task 1.3: Environment configuration
**File:** `backend/.env.example` (update)

Add new variables:
```
# Storage mode: 'online' (S3) or 'local' (disk)
STORAGE_MODE=online

# Local storage path (only used when STORAGE_MODE=local)
# Defaults to ~/.gsworkspace if not set
LOCAL_STORAGE_PATH=
```

---

### Phase 2: Backend Route Updates

#### Task 2.1: Create local files endpoint
**File:** `backend/src/routes/localFiles.ts`

New route to serve files from local disk storage:
- `GET /api/local-files/*` - Serve files from `LOCAL_STORAGE_PATH`
- Set appropriate `Content-Type` headers based on file extension
- Handle 404 for missing files
- Security: Validate paths don't escape storage directory (prevent path traversal)

#### Task 2.2: Update scenes routes
**File:** `backend/src/routes/scenes.ts`

Replace direct S3 calls with storage abstraction:
- Import `getStorageService()` instead of S3 functions
- Update all `saveToS3` → `storage.save()`
- Update all `loadFromS3` → `storage.load()`
- Update all `deleteFromS3` → `storage.delete()`
- Update URL generation to use `storage.getPublicUrl()`

#### Task 2.3: Update items routes
**File:** `backend/src/routes/items.ts`

Replace direct S3 calls with storage abstraction:
- Update image/video upload endpoints
- Update crop endpoints
- Ensure temp file handling works with both modes

#### Task 2.4: Add storage mode API endpoint
**File:** `backend/src/routes/config.ts` (new)

Expose current storage mode to frontend:
- `GET /api/config` - Returns `{ storageMode: 'online' | 'local' }`
- `POST /api/config/storage-mode` - Change storage mode at runtime (optional)

---

### Phase 3: Frontend Updates

#### Task 3.1: Update storage mode types
**File:** `frontend/src/api/storage/index.ts`

Expand storage mode to three options:
```typescript
type StorageMode = 'online' | 'local' | 'offline'

let storageMode: StorageMode = 'online'

export function getStorageMode(): StorageMode
export function setStorageMode(mode: StorageMode): void
export function isOfflineMode(): boolean  // Backward compat: returns mode === 'offline'
```

#### Task 3.2: Update DelegatingStorageProvider
**File:** `frontend/src/api/storage/DelegatingStorageProvider.ts`

Update delegation logic:
- `online` → ApiStorageProvider (backend uses S3)
- `local` → ApiStorageProvider (backend uses disk)
- `offline` → LocalStorageProvider (browser IndexedDB)

The frontend doesn't need to distinguish between `online` and `local` - both use the API provider. The backend handles the actual storage difference.

#### Task 3.3: Fetch storage mode from backend
**File:** `frontend/src/App.tsx` or new `useStorageMode` hook

On app startup (when not in offline mode):
- Fetch `GET /api/config` to get server's storage mode
- Update local state to reflect whether server is in `online` or `local` mode
- Display indicator in UI

#### Task 3.4: Update Settings UI
**File:** `frontend/src/components/settings/SettingsModal.tsx` (or new tab)

Add storage mode selector:
- Radio buttons or dropdown: Online (S3) / Local Disk / Offline (Browser)
- Show current storage location info
- When switching modes:
  - `offline` ↔ others: Just update frontend state
  - `online` ↔ `local`: Call `POST /api/config/storage-mode` to update backend
- Warning when switching: "Data is stored separately in each mode"

#### Task 3.5: Update Toolbar indicator
**File:** `frontend/src/components/Toolbar.tsx`

Update the offline mode indicator to show all three modes:
- 🌐 Online (S3)
- 💾 Local Disk
- 📴 Offline (Browser)

---

### Phase 4: Testing & Edge Cases

#### Task 4.1: Handle mode-specific behaviors
- **Media URLs:** In local mode, media URLs point to `/api/local-files/...` instead of S3 URLs
- **Scene migration:** Scenes saved in one mode aren't automatically available in others
- **Startup:** Backend should create `~/.gsworkspace` directory on first usage of local mode if it doesn't exist

#### Task 4.2: Error handling
- Graceful fallback if local storage path is not writable
- Clear error messages in UI when storage operations fail
- Handle disk space issues

#### Task 4.3: Documentation
- Update README with local mode setup instructions
- Document environment variables
- Add architecture diagram showing three modes

---

## File Changes Summary

### New Files
- `backend/src/services/diskStorage.ts` - Disk storage implementation
- `backend/src/services/storage.ts` - Storage abstraction layer
- `backend/src/routes/localFiles.ts` - Serve local files endpoint
- `backend/src/routes/config.ts` - Configuration API

### Modified Files
- `backend/.env.example` - Add STORAGE_MODE, LOCAL_STORAGE_PATH
- `backend/src/index.ts` - Register new routes
- `backend/src/routes/scenes.ts` - Use storage abstraction
- `backend/src/routes/items.ts` - Use storage abstraction
- `frontend/src/api/storage/index.ts` - Three-mode support
- `frontend/src/api/storage/DelegatingStorageProvider.ts` - Updated delegation
- `frontend/src/components/Toolbar.tsx` - Mode indicator
- `frontend/src/components/settings/SettingsModal.tsx` - Mode selector

---

## Implementation Order

1. **Phase 1** - Backend disk storage (can test independently with curl)
2. **Phase 2** - Backend route updates (existing frontend should still work with S3)
3. **Phase 3** - Frontend updates (full feature complete)
4. **Phase 4** - Testing & polish

---

## Notes

- The three modes store data in completely separate locations - there's no automatic sync
- Users who want to migrate data between modes would need to export/import scenes
- Local mode is ideal for users running both client and server on their machine
- Local mode still requires the backend server (unlike offline mode)
