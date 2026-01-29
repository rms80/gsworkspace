# TODO

## Offline Mode Implementation

Enable the frontend to function as a standalone client-side app without a backend server. LLM execution will be disabled (Run button), but all canvas editing and scene persistence will work via localForage (IndexedDB).

**Design Decisions:**
- **Storage:** localForage (simple API, IndexedDB backing, ~50MB+ capacity)
- **Mode switching:** Feature flag for now (automatic detection later)
- **LLM features:** Can create prompt items, but Run button disabled when offline
- **Images:** Stored as-is (no compression)

---

### 1. Create Pluggable Storage Provider Architecture

Add a storage provider interface so different backends can be swapped easily. The existing S3/API storage becomes one provider, localForage becomes another. A delegating provider wraps both and routes calls based on current mode.

**New files:**
- `frontend/src/api/storage/StorageProvider.ts` - interface definition
- `frontend/src/api/storage/ApiStorageProvider.ts` - existing S3/backend (refactored)
- `frontend/src/api/storage/LocalStorageProvider.ts` - new localForage implementation
- `frontend/src/api/storage/DelegatingStorageProvider.ts` - routes to active provider based on mode
- `frontend/src/api/storage/index.ts` - exports provider instance and mode controls

**Substeps:**

1.1. **Define StorageProvider interface**
   ```typescript
   interface StorageProvider {
     saveScene(scene: Scene): Promise<void>
     loadScene(id: string): Promise<Scene>
     listScenes(): Promise<SceneMetadata[]>
     deleteScene(id: string): Promise<void>
     saveHistory(sceneId: string, history: SerializedHistory): Promise<void>
     loadHistory(sceneId: string): Promise<SerializedHistory>
   }
   ```

1.2. **Create ApiStorageProvider**
   - Move existing fetch-based code from `scenes.ts` into a class implementing the interface
   - No behavior change, just reorganization

1.3. **Install localForage**
   - Run `npm install localforage` in the frontend directory

1.4. **Create LocalStorageProvider**
   - Implement the interface using localForage
   - Key scheme: `workspaceapp:scene:{id}`, `workspaceapp:scenes-index`, `workspaceapp:history:{id}`
   - Maintain a scenes index for `listScenes()` (localForage doesn't have key enumeration)

1.5. **Create DelegatingStorageProvider**
   - Holds instances of both ApiStorageProvider and LocalStorageProvider
   - Checks current mode and delegates to appropriate provider
   - Supports runtime mode switching
   ```typescript
   class DelegatingStorageProvider implements StorageProvider {
     private apiProvider = new ApiStorageProvider()
     private localProvider = new LocalStorageProvider()

     private get active(): StorageProvider {
       return isOfflineMode() ? this.localProvider : this.apiProvider
     }

     saveScene(scene: Scene) { return this.active.saveScene(scene) }
     // ... other methods delegate similarly
   }
   ```

1.6. **Create index.ts exports**
   - Export singleton `storageProvider` (the DelegatingStorageProvider instance)
   - Export `isOfflineMode()` function to check current mode
   - Export `setOfflineMode(boolean)` function to change mode at runtime
   - Mode state can be a simple module-level variable for now

1.7. **Update scenes.ts**
   - Keep as thin re-export from storage module for backwards compatibility
   - Existing imports in App.tsx continue to work

**Notes:**
- Data is kept separate between modes (no sync/migration for now)
- Supports runtime switching between online and offline
- This pattern makes it easy to add future providers (e.g., Firebase, file-based export/import)
- Each provider is self-contained and testable
- localForage handles serialization automatically, no JSON.stringify needed

---

### 2. Add Offline Mode Feature Flag and Runtime Switching

Use an environment variable for initial mode, with support for runtime switching.

**Files to modify:** `frontend/src/api/storage/index.ts`, `frontend/src/App.tsx`

**Substeps:**

2.1. **Create initial mode from environment**
   - Add environment variable: `VITE_OFFLINE_MODE=true/false` in `.env` or `.env.local`
   - Initialize mode state from `import.meta.env.VITE_OFFLINE_MODE`
   - Default to `false` (online mode) if not set

2.2. **Export mode controls from storage module**
   - `isOfflineMode()` - returns current mode
   - `setOfflineMode(boolean)` - changes mode at runtime
   - DelegatingStorageProvider automatically uses new mode on next call

2.3. **Handle mode switch in App**
   - When mode changes, App needs to reload scene list from new provider
   - Could trigger via event, callback, or React state update
   - Current scene may not exist in new provider - handle gracefully

---

### 3. Disable LLM Run Button in Offline Mode

Users can still create prompt items and configure them, but execution is disabled.

**Files to modify:** `frontend/src/components/Toolbar.tsx`, prompt-related components

**Substeps:**

3.1. **Keep prompt/LLM item creation enabled**
   - Users can still add prompt items to canvas
   - Users can still edit prompt text and settings

3.2. **Disable the "Run" button when offline**
   - Grey out the Run/Generate button
   - Add tooltip: "Requires backend server"

3.3. **Handle accidental submission**
   - If somehow triggered, show user-friendly error
   - Don't attempt network request

---

### 4. Handle Image Operations Without Backend

Ensure image paste, crop, and display work without server. Images stored as-is (no compression).

**Files to modify:** `frontend/src/hooks/useClipboard.ts`, `frontend/src/hooks/useCropMode.ts`

**Substeps:**

4.1. **Use data URLs directly in offline mode**
   - Skip the S3 upload call when offline
   - Store images as base64 data URLs in localForage
   - localForage has plenty of capacity for this

4.2. **Handle image crop client-side only**
   - `useCropMode.ts` has server-side crop call
   - In offline mode, apply crop visually only
   - Skip the server upload silently

4.3. **Handle image proxy gracefully**
   - External image URLs need `/api/proxy-image` due to CORS
   - In offline mode, skip proxy or warn user about external URLs

---

### 5. Add Offline Mode UI Indicator

Show users they're in demo/offline mode.

**Files to modify:** `frontend/src/components/Toolbar.tsx` or new component

**Substeps:**

5.1. **Add visual indicator**
   - Small badge or banner: "Demo Mode" or "Offline"
   - Non-intrusive but visible

5.2. **Add info tooltip/popover**
   - Explain what works and what doesn't
   - Link to setup instructions if they want full features

---

### 6. Testing

Verify offline demo works correctly end-to-end.

**Substeps:**

6.1. **Test with feature flag enabled**
   - Set `OFFLINE_MODE = true`
   - Start frontend only (no backend)

6.2. **Test scene operations**
   - Create scene, add items, refresh page - data persists
   - Create multiple scenes, switch between them
   - Delete a scene

6.3. **Test canvas operations**
   - Add text and images
   - Move, scale, rotate items
   - Undo/redo within session
   - Undo/redo persists across refresh

6.4. **Test image handling**
   - Paste image from clipboard
   - Paste image from file
   - Crop an image

6.5. **Test LLM features**
   - Can create prompt items
   - Run button is disabled
   - No errors in console

---

## Implementation Notes

- **Priority order:** Task 1 (storage provider architecture) is foundational; Tasks 2-5 depend on it
- **New directory:** `frontend/src/api/storage/` contains the provider pattern
- **No backend changes needed** - this is frontend-only
- **Storage library:** Using localForage for simple API with IndexedDB backing (larger capacity than localStorage)
- **Extensibility:** New providers can be added by implementing `StorageProvider` interface
