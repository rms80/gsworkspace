## Undo/redo functionality

This app will have a persistent undo/redo system, that tracks changes in the scene using deltas or "change" objects/records.
The history stack will be serialized in a "sidecar" file history.json adjacent to the main scene.json.
The change history will be restored when the scene is loaded.
Each scene has it's own history, and undo/redo only affects the currently active scene.

Change records should be relatively minimal, ie there should be 'add_object', 'delete_object',
'transform_object' (for translation/scaling/rotation), 'update_text' for text edits, and any
others that make sense in context.

The undo and redo steps for each change record should be implemented separately, as
code that implements a generic change-record interface. The history record should store
the info about which object it applies to. The main app will pass the scene to the history
record implementation and it will do the updating as needed. 

- [ ] create a new branch for this feature in github and switch to that branch
- [ ] create separate files for the history system, in a subfolder /history
- [ ] define an interface for history change records and the history system
- [ ] Implement creating the history stack for the current scene in the main app
- [ ] Implement the different types of change records and add them to the history in the right place
- [ ] Implement serializing the history stack, and restoring it on load
- [ ] Add undo/redo buttons to the Toolbar
- [ ] Implement Ctrl+Z (undo) and Ctrl+Y/Ctrl+Shift+Z (redo) keyboard shortcuts
- [ ] Truncate the History when a change is made while at some previous history state (IE normal undo history behaviour)
- [ ] Create a Pull Request for this new feature branch





## HTML View Object

Add a new canvas item type that displays formatted HTML content. This will be used to display
LLM-generated HTML output that can include text layout and reference images from the scene.
The HTML will be rendered in a sandboxed iframe for security and proper CSS isolation.
Images in the scene are stored in S3 with public URLs, so the HTML can reference them directly.

Note: Images must be saved to S3 first (via auto-save) before they can be referenced in HTML,
as newly pasted images start as data URLs.

### Implementation Steps

- [ ] Create a new feature branch `feature/html-view` and switch to it
- [ ] Add `HtmlItem` type to `frontend/src/types/index.ts`
  - Properties: id, type, x, y, width, height, html (string content)
- [ ] Add `HtmlItem` rendering in `InfiniteCanvas.tsx`
  - Use a Konva Rect as placeholder/selection target on the canvas
  - Render actual HTML in a DOM iframe overlay positioned above the canvas
  - Handle selection, dragging, and resizing like other items
- [ ] Add backend save/load support in `backend/src/routes/scenes.ts`
  - Store HTML content in a `.html` file in S3 (similar to how text stores `.txt`)
  - Add `StoredHtmlItem` interface and handle in save/load routes
- [ ] Add history change records for HTML items
  - `AddObjectChange` and `DeleteObjectChange` should already work
  - `TransformObjectChange` should already work
  - Add `UpdateHtmlChange` if we want to support editing HTML content later
- [ ] Test creating HTML items programmatically (for now, no UI to create them)
  - Add a temporary test button
- [ ] Create a Pull Request for this feature branch



## HTMLGen Object and Functionality

The goal of this task is to create a new type of object in the scene, called "HTML Gen",
that calls an LLM to generate a small webpage from image and text content. The main
use of this is to generate help/tutorial pages for other applications, I will drop
in screenshots and write basic text (bullet points, etc) and ask the LLM to generate
a formatted fleshed-out webpage. 

The HTMLGen object will be similar to the existing Prompt or ImageGen objects.
However in addition to the user-editable prompt, it will have a predefined system prompt.
The system prompt will be stored in a separate text file on the server for now.

The query to the LLM will include the user and system prompts, as well as information
about the selected image and text objects. This needs to include spatial information
so that the web page can be laid out properly. Lets try sending this as json, ie
the input objects will be converted to json with separate interspersed blocks for the text and
images. The blocks should be sorted by Y-height in the canvas. For images we can send
the position and size information as well. Ignore rotation for now. Put the code
that does this into a separate utility function.

One complication will be how to send the images to the LLM and have it return references
to the images in the HTML. In the json, include the server-side S3 URL for each image as a field.

Do this work in a separate feature branch and create a PR when you are done.

### Task List

#### 1. Define Types
- [ ] Add `HTMLGenPromptItem` interface to `frontend/src/types/index.ts`
  - Fields: `type: 'html-gen-prompt'`, `label`, `text` (user prompt), `fontSize`, `width`, `height`, `model` (LLMModel)
- [ ] Add `HTMLGenPromptItem` to the `CanvasItem` union type

#### 2. Create Spatial JSON Utility (Frontend)
- [ ] Create new utility file `frontend/src/utils/spatialJson.ts`
- [ ] Implement `convertItemsToSpatialJson(items: CanvasItem[])` function that:
  - Filters to only TextItem and ImageItem types
  - Sorts items by Y position (top to bottom)
  - Returns JSON array with blocks containing:
    - For text: `{ type: 'text', content: string, position: { x, y }, size: { width, height } }`
    - For images: `{ type: 'image', s3Url: string, position: { x, y }, size: { width, height } }`. Bake the scale into the width and height.

#### 3. Create System Prompt Storage (Backend)
- [ ] Create directory `backend/prompts/` for storing system prompts
- [ ] Create `backend/prompts/html-gen-system.txt` with the HTML generation system prompt
  - Instruct LLM to generate clean, semantic HTML
  - Include instructions for using provided image URLs
  - Specify layout guidance based on spatial positions

#### 4. Backend API Endpoint
- [ ] Add route `POST /api/llm/generate-html` to `backend/src/routes/llm.ts`
  - Accept: `{ spatialItems: SpatialItem[], userPrompt: string, model: LLMModel }`
  - Load system prompt from file
  - Combine system prompt + spatial JSON + user prompt
  - Call LLM service
  - Return: `{ html: string }`

#### 5. Frontend API Function
- [ ] Add `generateHtml()` function to `frontend/src/api/llm.ts`
  - Parameters: `items: CanvasItem[]`, `prompt: string`, `model: LLMModel`
  - Use `convertItemsToSpatialJson()` to prepare items
  - Call `/api/llm/generate-html` endpoint
  - Return the generated HTML string

#### 6. HTMLGen Canvas Component
- [ ] Create or update component to render `HTMLGenPromptItem` on canvas
  - Similar styling to existing PromptItem (editable text area, label)
  - Include model selector dropdown
  - Add "Generate" button

#### 7. Toolbar Integration
- [ ] Add "HTML Gen" button to `frontend/src/components/Toolbar.tsx`
- [ ] Implement handler to create new HTMLGenPromptItem at canvas center

#### 8. Generation Flow in App.tsx
- [ ] Add handler for HTMLGen generation trigger
  - Get selected items (excluding the HTMLGenPromptItem itself)
  - Call `generateHtml()` with selected items and prompt
  - Create new `HtmlItem` with the result, positioned to the right of the prompt

#### 9. Image S3 URL Handling
- [ ] Ensure images have S3 URLs available (may need to upload on-demand before generation)
- [ ] Update `convertItemsToSpatialJson()` to extract/use S3 URLs from ImageItem.src or upload if needed





## Image Memory Optimization

Currently, images are stored as data URLs in memory until the scene is saved to the backend, which then uploads them to S3. This causes memory and performance issues:

### Problems

1. **Memory bloat**: Data URLs are base64-encoded (+33% size), stored in JS heap
2. **History duplication**: Each add/delete of an image stores the full data URL in the history stack (up to 100 records)
3. **Network overhead**: Full data URLs are sent over the network on every auto-save until the backend processes them
4. **Slow serialization**: `JSON.stringify()` on large data URLs is expensive, happens on every change detection

### Proposed Solution

Upload images to S3 immediately on paste/drop, before adding to canvas:

```
Current flow:
  paste image → store data URL → auto-save → backend extracts & uploads to S3

Proposed flow:
  paste image → upload to S3 immediately → store S3 URL → auto-save (small URL only)
```

### Implementation Tasks

- [x] Add `/api/upload-image` endpoint that accepts image data and returns S3 URL (already existed)
- [x] Update paste handler in `InfiniteCanvas.tsx` to upload before creating item
- [x] Update drag-drop handler similarly
- [x] Update context menu paste handler similarly
- [ ] Consider showing upload progress indicator for large images
- [x] History records will now only store small S3 URLs instead of data URLs

### Benefits

- Reduced memory usage (URL string vs multi-MB data URL)
- Faster change detection and auto-save
- Smaller network payloads
- History stack stays lightweight
- Images available immediately for other operations (copy to clipboard, etc.)






## InfiniteCanvas.tsx Refactoring Plan

The file is currently **2,158 lines**. After the first round of hook extraction (viewport, selection, crop, clipboard, prompt editing), the remaining bulk is item renderers, editing overlays, and context menus — all inline JSX and handler functions. The goal is to extract these into focused components and hooks, bringing InfiniteCanvas down to ~400-500 lines as a thin orchestrator.

### Phase 1: Extract Item Renderers (~800 lines) ✅

Extracted into `components/canvas/items/`. The generic `PromptItemRenderer` replaced 3 duplicated prompt blocks.

- [x] **`TextItemRenderer.tsx`** — Group with Rect+Text, drag/transform handlers, double-click to edit
- [x] **`ImageItemRenderer.tsx`** — KonvaImage with crop overlay branch, right-click context menu trigger, transform handlers
- [x] **`PromptItemRenderer.tsx`** — Generic renderer used for all 3 prompt types (prompt, image-gen-prompt, html-gen-prompt) via theme config prop
- [x] **`HtmlItemRenderer.tsx`** — Header bar with label, export/zoom buttons, content rect, drag/transform with real-time iframe sync

### Phase 2: Extract Editing Overlays (~240 lines) ✅

Extracted into `components/canvas/overlays/`. The generic `PromptEditingOverlay` replaced 3 duplicated label+text overlay blocks (6 inline elements → 3 component calls).

- [x] **`TextEditingOverlay.tsx`** — Textarea overlay for text item editing, with Konva text measurement for min-height
- [x] **`PromptEditingOverlay.tsx`** — Generic input (label) + textarea (text) overlay, parameterized by theme colors. One component used for all 3 prompt types
- [x] **`HtmlLabelEditingOverlay.tsx`** — Input overlay for HTML item label editing

### Phase 3: Extract Context Menus (~450 lines) ✅

All menus extracted into `components/canvas/menus/`. Click-outside dismiss handled by `useMenuState` hook.

- [x] **`CanvasContextMenu.tsx`** — Right-click paste menu
- [x] **`ModelSelectorMenu.tsx`** — Generic model selector with type parameter, used for all 3 prompt types
- [x] **`ImageContextMenu.tsx`** — Reset transform, crop, remove crop
- [x] **`HtmlExportMenu.tsx`** — HTML/Markdown single-file and ZIP exports, with shared error handling

### Phase 4: Extract Supporting Hooks (~120 lines) ✅

- [x] **`usePulseAnimation.ts`** — Pulse phase animation loop + layer redraw for running prompts. Returns `pulsePhase`
- [x] **`useMenuState.ts`** — Generic hook for menu open/close with click-outside-to-dismiss. Replaced 12 state declarations and 6 useEffect blocks with 6 one-liner hook calls
- [x] **`useImageLoader.ts`** — Load HTMLImageElements for image items into a Map cache
- [x] **`useTransformerSync.ts`** — Attach/detach Konva Transformer nodes on selection change via a declarative config array

### Phase 5: Extract Constants ✅

- [x] **`constants/canvas.ts`** — Extracted prompt theme colors (3 themes with pulse ranges), model lists with labels, button/header dimensions, zoom constraints, z-index values, selection colors, and a `getPulseColor()` helper

### Expected Result

| Section | Current Lines | After Extraction |
|---------|--------------|-----------------|
| Item renderers | ~800 | 0 (in own files) |
| Editing overlays | ~240 | 0 (in own files) |
| Context menus | ~450 | 0 (in own files) |
| Supporting hooks/effects | ~120 | 0 (in own files) |
| Constants | ~30 | 0 (in own file) |
| **Remaining in InfiniteCanvas.tsx** | — | **~400-500** |

InfiniteCanvas.tsx becomes: imports, props, hook calls, a few local handlers (drag-drop, HTML label editing), and the JSX skeleton (`<div>` → `<Stage>` → `<Layer>` → item renderers + transformers + overlays + menus).

### File Structure

```
frontend/src/
  components/
    InfiniteCanvas.tsx              (~400-500 lines, orchestrator)
    canvas/
      items/
        TextItemRenderer.tsx
        ImageItemRenderer.tsx
        PromptItemRenderer.tsx      (generic, used for all 3 prompt types)
        HtmlItemRenderer.tsx
      overlays/
        TextEditingOverlay.tsx
        PromptEditingOverlay.tsx    (generic, used for all 3 prompt types)
        HtmlLabelEditingOverlay.tsx
      menus/
        CanvasContextMenu.tsx
        ModelSelectorMenu.tsx       (generic, used for all 3 model menus)
        ImageContextMenu.tsx
        HtmlExportMenu.tsx
  hooks/
    useCanvasViewport.ts            (already extracted)
    useCanvasSelection.ts           (already extracted)
    useCropMode.ts                  (already extracted)
    useClipboard.ts                 (already extracted)
    usePromptEditing.ts             (already extracted)
    usePulseAnimation.ts            (already extracted)
    useMenuState.ts                 (already extracted)
    useImageLoader.ts               (already extracted)
    useTransformerSync.ts           (already extracted)
  constants/
    canvas.ts                       (already extracted)
```

### Implementation Order

Phases can be done independently, but this order minimizes merge conflicts:

1. **Phase 4** (hooks) — No JSX changes, just extracting logic
2. **Phase 5** (constants) — Small, no structural change
3. **Phase 1** (item renderers) — Largest impact, removes bulk of JSX
4. **Phase 2** (editing overlays) — Depends on item renderers being stable
5. **Phase 3** (context menus) — Independent, can go in any order after hooks







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





## Scene Export/Import Feature

Enable exporting and importing entire scenes as zip files for backup, sharing, and portability.

**Design Decisions:**
- Export format: ZIP archive containing scene.json, history.json, and images folder
- Images stored as separate files (not embedded in JSON) for smaller file sizes
- Support both ZIP import and directory import
- UI: File menu with Export/Import options

---

### 1. Create File Menu UI

Add a File menu to the menu bar with export/import options.

**Files to modify:** `frontend/src/components/MenuBar.tsx`

**Substeps:**

1.1. **Add File menu dropdown**
   - Add "File" as first menu item
   - Dropdown with:
     - "Export Scene..."
     - "Import Scene from Zip..."
     - "Import Scene from Folder..."

1.2. **Wire up callbacks**
   - `onExportScene` - triggers export of active scene
   - `onImportSceneFromZip` - opens ZIP file picker directly
   - `onImportSceneFromFolder` - opens folder picker directly

---

### 2. Implement Scene Export

Export the active scene as a ZIP file.

**New files:** `frontend/src/utils/sceneExport.ts`

**Substeps:**

2.1. **Install jszip library**
   - Run `npm install jszip` in frontend directory
   - This handles ZIP creation in the browser

2.2. **Create export utility function**
   ```typescript
   async function exportScene(scene: Scene, history: SerializedHistory): Promise<Blob>
   ```

2.3. **Build ZIP structure**
   ```
   scene-name.zip/
   ├── scene.json        # Scene data with local image references
   ├── history.json      # Undo/redo history
   └── images/
       ├── {id}.png      # Original images
       └── {id}_crop.png # Cropped versions (if applicable)
   ```

2.4. **Process images for export**
   - For each ImageItem in the scene:
     - Fetch image from `src` (handle both data URLs and S3 URLs)
     - Save as `images/{item.id}.png`
     - If `cropSrc` exists, save as `images/{item.id}_crop.png`
     - Update scene.json to use relative paths: `"src": "images/{id}.png"`

2.5. **Handle S3/external URLs**
   - Use `/api/proxy-image` to fetch external images (CORS)
   - Convert to blob for inclusion in ZIP
   - In offline mode, only data URLs will work

2.6. **Trigger download**
   - Create blob URL from ZIP
   - Trigger browser download with filename `{scene.name}.zip`

---

### 3. Implement Scene Import

Import a scene from a ZIP file or directory.

**New files:** `frontend/src/utils/sceneImport.ts`

**Substeps:**

3.1. **Create hidden file inputs**
   - Hidden `<input type="file" accept=".zip">` for ZIP import
   - Hidden `<input type="file" webkitdirectory>` for folder import
   - Menu items trigger `.click()` on appropriate input

3.2. **Create import utility functions**
   ```typescript
   async function importSceneFromZip(file: File): Promise<{ scene: Scene, history: SerializedHistory }>
   async function importSceneFromDirectory(files: FileList): Promise<{ scene: Scene, history: SerializedHistory }>
   ```

3.3. **Parse ZIP file**
   - Use jszip to extract contents
   - Read scene.json and history.json
   - Load images from images/ folder

3.4. **Parse directory**
   - Find scene.json in file list
   - Find history.json in file list
   - Find images in images/ subfolder

3.5. **Process images for import**
   - Convert image files to data URLs (for offline mode)
   - Or upload to S3 and get URLs (for online mode)
   - Update scene.json image references with new sources

3.6. **Handle ID conflicts**
   - Generate new scene ID to avoid overwriting existing scenes
   - Optionally generate new item IDs

3.7. **Add imported scene**
   - Add to open scenes
   - Save to storage provider
   - Switch to the imported scene

---

### 4. Wire Up to App

Connect export/import to App.tsx state management.

**Files to modify:** `frontend/src/App.tsx`

**Substeps:**

4.1. **Add export handler**
   - Get active scene and its history
   - Call exportScene utility
   - Handle errors gracefully

4.2. **Add import handlers**
   - `handleImportFromZip` - triggered when ZIP file selected
   - `handleImportFromFolder` - triggered when folder selected
   - On successful import, add scene to state
   - Save to storage provider

4.3. **Pass handlers to MenuBar**
   - `onExportScene` prop
   - `onImportSceneFromZip` prop
   - `onImportSceneFromFolder` prop



## Implementation Notes

- **ZIP library:** jszip is well-maintained and works in browser
- **File structure:** Keep it simple and human-readable
- **Image format:** Export as PNG for quality, could add JPEG option later
- **Compatibility:** Exported ZIPs should be version-agnostic when possible
- **Offline mode:** Import should work in offline mode (images as data URLs)





## Video Block Support

### Status: Core Implementation Complete

The basic video support is now implemented. Below is the original plan with completed items marked.

### Requirements
- [x] **Add via**: File picker (Add menu) and drag-drop
- [x] **Playback**: Play/pause controls, seek slider
- [x] **Options**: Loop toggle, mute/unmute (muted by default)
- [x] **Storage**: Upload to S3 (online mode)
- [x] **Feature flag**: Can be disabled via config
- [x] **Drag-drop**: Add video via drag-drop
- [x] **Context menu**: Right-click menu with Reset Transform
- [ ] **Storage**: IndexedDB persistence for offline mode (videos use temporary blob URLs currently)

---

### Implementation Plan

#### Phase 0: Feature Flag - DONE

- [x] Add feature flag in `frontend/src/config.ts`
- [x] Gate "Video" option in Add menu behind flag

#### Phase 1: Types & Data Model - DONE

- [x] Add VideoItem type in `frontend/src/types/index.ts`
- [x] Update CanvasItem union type
- [x] Update scene save/load in `backend/src/routes/scenes.ts`

#### Phase 2: Backend - Video Upload - DONE

- [x] Add video upload endpoint `/api/items/upload-video`

#### Phase 3: Frontend - Video Upload API - DONE

- [x] Add uploadVideo function in `frontend/src/api/videos.ts`
- [x] Handle online mode (S3 upload)
- [x] Basic offline mode support (blob URLs - not persisted across reloads)
- [x] Update MenuBar with Video option

#### Phase 4: Video Item Renderer - DONE

- [x] Create VideoItemRenderer (Konva Rect placeholder)
- [x] Create VideoOverlay (HTML5 video element)

#### Phase 5: Playback Controls - DONE

- [x] Play/pause button
- [x] Seek slider
- [x] Time display
- [x] Mute/unmute toggle
- [x] Loop toggle

#### Phase 6: Drag-Drop Support - DONE

- [x] Handle video files on drag-drop
- [ ] Show loading indicator during upload (future enhancement)

#### Phase 7: Integration - DONE

- [x] Render VideoItemRenderer for video items
- [x] Add video transformer for resize
- [x] Handle video item selection
- [x] Add handleAddVideo in App.tsx

#### Phase 8: Scene Persistence - DONE

- [x] Update scene export to include videos
- [x] Update scene import to handle videos
- [x] Backend scene save/load for videos

---

### Remaining Work

1. **Offline persistence** - Store video blobs in IndexedDB so they persist across page reloads
2. **Upload progress** - Show progress indicator for large video uploads

---

### Files Changed

**New Files:**
- `frontend/src/api/videos.ts`
- `frontend/src/components/canvas/items/VideoItemRenderer.tsx`
- `frontend/src/components/canvas/overlays/VideoOverlay.tsx`

**Modified Files:**
- `frontend/src/config.ts` - Added videoSupport feature flag
- `frontend/src/types/index.ts` - Added VideoItem type
- `frontend/src/components/MenuBar.tsx` - Added Video menu option
- `frontend/src/components/InfiniteCanvas.tsx` - Render video items and overlay
- `frontend/src/App.tsx` - Added video handling
- `backend/src/routes/items.ts` - Video upload endpoint
- `backend/src/routes/scenes.ts` - Video save/load
- `frontend/src/utils/sceneExport.ts` - Export videos
- `frontend/src/utils/sceneImport.ts` - Import videos





## Remote Change Detection Feature

### Overview

Detect when a scene has been modified on the server and present a conflict resolution dialog with three options: get remote, keep local, or fork.

### Requirements (from user)

- Every 30 seconds, poll the server for the current `modifiedAt` timestamp of the active scene
- Also check when a scene is first opened, and when the user switches to the scene's tab
- If remote `modifiedAt` is newer than local, show a conflict dialog with 3 options:
  - Get Remote - Discard local, reload from server
  - Keep Local - Overwrite server with local version
  - Fork - Save local version as a new scene copy

---

### Implementation Steps

#### 1. Backend - Add Timestamp Endpoint

**File:** `backend/src/routes/scenes.ts`

Add `GET /api/scenes/:id/timestamp` endpoint that returns only `{ id, modifiedAt }` without loading full scene data. Place before the `/:id` route.

#### 2. Frontend API - Add Timestamp Fetch

**Files to modify:**
- `frontend/src/api/storage/StorageProvider.ts` - Add `getSceneTimestamp(id)` to interface
- `frontend/src/api/storage/ApiStorageProvider.ts` - Implement fetch to `/api/scenes/:id/timestamp`
- `frontend/src/api/storage/LocalStorageProvider.ts` - Return `null` (offline mode skips checks)
- `frontend/src/api/storage/DelegatingStorageProvider.ts` - Delegate to active provider
- `frontend/src/api/storage/index.ts` - Export the function

#### 3. Create Conflict Dialog Component

**New file:** `frontend/src/components/ConflictDialog.tsx`

Modal dialog showing:
- Scene name
- Local vs remote timestamps
- Three buttons: "Get Remote", "Keep Local", "Fork"

Style to match existing `OpenSceneDialog.tsx`.

#### 4. Create Remote Change Detection Hook

**New file:** `frontend/src/hooks/useRemoteChangeDetection.ts`

Custom hook that:
- Polls every 30 seconds for active scene's remote timestamp
- Skips checks in offline mode, during save, or with unsaved changes
- Tracks `hasConflict` and `remoteModifiedAt` state
- Provides `checkNow()` for on-demand checks (tab switch, scene open)
- Provides `clearConflict()` to dismiss after resolution

#### 5. Integrate into App.tsx

**File:** `frontend/src/App.tsx`

- Import and use the hook with active scene info
- Add conflict resolution handlers:
  - `handleGetRemote`: Load remote scene, replace local state
  - `handleKeepLocal`: Force save local version to server
  - `handleFork`: Create new scene with local content and new ID/name
- Trigger `checkNow()` on tab switch and scene open
- Render `ConflictDialog` component

---

### Conflict Resolution Logic

| Action | Result |
|--------|--------|
| Get Remote | Discard local, reload scene from server, reload history |
| Keep Local | Save local scene to server (overwrite remote) |
| Fork | Create new scene "{name} (copy)" with local content, switch to it |

---

### Edge Cases

- **Unsaved changes**: Skip remote checks to avoid confusion during editing
- **During save**: Pause checks to prevent race conditions
- **Offline mode**: All checks disabled
- **Network errors**: Fail silently, don't disrupt user

---

### Files Modified

| File | Change |
|------|--------|
| `backend/src/routes/scenes.ts` | Add `/timestamp` endpoint |
| `frontend/src/api/storage/StorageProvider.ts` | Add interface method |
| `frontend/src/api/storage/ApiStorageProvider.ts` | Implement timestamp fetch |
| `frontend/src/api/storage/LocalStorageProvider.ts` | Stub returning null |
| `frontend/src/api/storage/DelegatingStorageProvider.ts` | Delegate method |
| `frontend/src/api/storage/index.ts` | Export function |
| `frontend/src/components/ConflictDialog.tsx` | New dialog component |
| `frontend/src/hooks/useRemoteChangeDetection.ts` | New hook |
| `frontend/src/App.tsx` | Integration and handlers |

---

### Verification

1. Start backend and frontend dev servers
2. Open a scene in browser tab A
3. Open same scene in browser tab B
4. Make changes in tab B and let it auto-save
5. Wait up to 30 seconds in tab A - conflict dialog should appear
6. Test each resolution option:
   - "Get Remote" - tab A shows tab B's changes
   - "Keep Local" - tab A's version overwrites server
   - "Fork" - new scene created with tab A's content
7. Verify dialog appears on tab switch if conflict exists
8. Verify no polling in offline mode






## Inline Content Storage for Text and Prompt Objects

**Goal**: Store `text`, `label`, and `model` fields directly in `scene.json` for text blocks and prompt objects, instead of in separate files. HTML objects continue using separate `.html` files.

**Branch**: `feature/inline-text-content`

---

### Current Architecture

| Item Type | Current Storage | Change |
|-----------|-----------------|--------|
| Text | `{id}.txt` file, scene.json has `file` reference | Inline `text` in scene.json |
| Prompt | `{id}.prompt.json` with `{label, text, model}` | Inline all fields in scene.json |
| ImageGen Prompt | `{id}.imagegen.json` with `{label, text, model}` | Inline all fields in scene.json |
| HTMLGen Prompt | `{id}.htmlgen.json` with `{label, text, model}` | Inline all fields in scene.json |
| HTML | `{id}.html` file | **No change** - keep separate file |
| Image | `{id}.png` etc. | **No change** |
| Video | `{id}.{ext}` | **No change** |

---

### Implementation Plan

#### Phase 1: Create Feature Branch
- [x] Create branch `feature/inline-text-content` from master

#### Phase 2: Backend - Update Scene Types
- [x] Update `backend/src/types/` (if exists) or inline types in routes
- [x] Remove `file` field from text/prompt item schemas in scene.json
- [x] Add inline `text` field to text items
- [x] Add inline `text`, `label`, `model` fields to prompt/imagegen/htmlgen items

#### Phase 3: Backend - Update Save Logic (`backend/src/routes/scenes.ts`)
- [x] Modify `saveScene` to write text content directly to scene.json items
- [x] Modify `saveScene` to write prompt fields directly to scene.json items
- [x] Remove code that creates separate `.txt` files for text items
- [x] Remove code that creates separate `.prompt.json` files
- [x] Remove code that creates separate `.imagegen.json` files
- [x] Remove code that creates separate `.htmlgen.json` files
- [x] Keep `.html` file creation for HTML items unchanged

#### Phase 4: Backend - Update Load Logic (`backend/src/routes/scenes.ts`)
- [x] Modify `loadScene` to read text content directly from scene.json
- [x] Modify `loadScene` to read prompt fields directly from scene.json
- [x] Remove code that loads separate `.txt` files
- [x] Remove code that loads separate `.prompt.json` files
- [x] Remove code that loads separate `.imagegen.json` files
- [x] Remove code that loads separate `.htmlgen.json` files
- [x] Keep `.html` file loading for HTML items unchanged

#### Phase 5: Undo/Redo Verification
- [ ] Verify history.json already stores full object data (including text/label/model)
  - Current architecture: history records store complete object snapshots
  - This should continue to work without changes
- [ ] Test undo/redo for text edits
- [ ] Test undo/redo for prompt label/text/model changes
- [ ] Test undo/redo for add/delete operations

#### Phase 6: Frontend Verification
- [ ] Verify frontend types already have inline fields (they should)
- [ ] Test that frontend correctly sends/receives inline content
- [ ] No changes expected - frontend already works with inline data

#### Phase 7: Testing
- [ ] Create a new scene with text blocks - verify inline storage
- [ ] Create a new scene with prompt objects - verify inline storage
- [ ] Create a new scene with HTML objects - verify separate file storage
- [ ] Test scene save/load round-trip
- [ ] Test undo/redo for all affected item types
- [ ] Test mixed scenes (text + prompts + HTML + images)

#### Phase 8: Cleanup
- [ ] Delete any existing test scenes (not compatible with new format)
- [ ] Remove any dead code paths for old file-based storage

---

### Files to Modify

**Backend:**
- `backend/src/routes/scenes.ts` - Main save/load logic (DONE)

**Frontend (verify only, likely no changes):**
- `frontend/src/types/index.ts` - Type definitions

---

### Undo/Redo Notes

The current undo/redo system stores **full object snapshots** in history records:
- `add_object`: stores complete object with all fields
- `delete_object`: stores complete object for restoration
- `update_text`: stores `oldText`/`newText`
- `update_prompt`: stores old/new label and text
- `update_model`: stores old/new model

This approach is independent of how data is persisted to S3, so undo/redo should continue to work correctly after the refactor. The history is stored in a separate `history.json` file that already contains inline content.

---

### Rollback Plan

If issues arise:
1. Keep the feature branch unmerged
2. Delete test scenes created with new format
3. Return to master branch

---

### Do NOT Merge Until
- [ ] Manual testing of all item types
- [ ] Undo/redo tested for text and prompt changes
- [ ] User confirms feature is working as expected








# TODO: Offline Mode AI Support

## Overview

Add support for AI features (LLM prompts, image generation, HTML generation) in offline mode by allowing users to configure their own API keys via a Settings dialog. API keys will be stored in the browser's localStorage.

Do all implementation in a feature branch. Don't merge or push unless I explicitly tell you to.

## Architecture

### New Components
- `SettingsDialog.tsx` - Modal dialog with tabbed interface
- `OfflineModeSettings.tsx` - Tab content for API key configuration

### Storage
- Extend `frontend/src/utils/settings.ts` to store API keys in localStorage
- Keys stored: `anthropicApiKey`, `googleApiKey`
- Keys should be stored separately from scene data for security (different localStorage key)

### API Layer Changes
- Create client-side API wrappers that call Claude/Gemini APIs directly from the browser
- Modify existing `frontend/src/api/llm.ts` to check offline mode and route accordingly:
  - Online mode: Use existing `/api/llm/*` backend endpoints
  - Offline mode: Use new client-side API calls with stored keys

---

## Implementation Tasks

### Phase 1: Settings Infrastructure

#### 1.1 Create API Key Storage Utilities
**File:** `frontend/src/utils/apiKeyStorage.ts`
- [x] Create `getAnthropicApiKey(): string | null`
- [x] Create `setAnthropicApiKey(key: string | null): void`
- [x] Create `getGoogleApiKey(): string | null`
- [x] Create `setGoogleApiKey(key: string | null): void`
- [x] Use a separate localStorage key (e.g., `workspaceapp-api-keys`) from scene settings
- [x] Consider basic obfuscation (not encryption - keys are client-side anyway)

#### 1.2 Create Settings Dialog Component
**File:** `frontend/src/components/SettingsDialog.tsx`
- [x] Create modal dialog component (similar style to existing dialogs)
- [x] Add tab navigation system (start with single "Offline Mode" tab, extensible for future)
- [x] Add open/close state management
- [x] Style consistently with existing app UI

#### 1.3 Create Offline Mode Settings Tab
**File:** `frontend/src/components/settings/OfflineModeSettingsTab.tsx`
- [x] Add password-type input field for Anthropic API key
- [x] Add password-type input field for Google API key
- [x] Add show/hide toggle for each key field
- [x] Add "Save" and "Clear" buttons for each key
- [x] Display validation status (key format check, not API validation)
- [x] Add help text explaining what each key is used for
- [x] Add warning about storing keys in browser

### Phase 2: Menu Integration

#### 2.1 Add Settings to Edit Menu
**File:** `frontend/src/components/MenuBar.tsx`
- [x] Add "Settings..." menu item to Edit menu
- [x] Add keyboard shortcut (Ctrl+, or Ctrl+Shift+S)
- [x] Wire up to open SettingsDialog

#### 2.2 Dialog State Management
**File:** `frontend/src/App.tsx`
- [x] Add `settingsDialogOpen` state
- [x] Add handlers for opening/closing settings dialog
- [x] Pass props down to MenuBar and render SettingsDialog

### Phase 3: Client-Side API Implementation

#### 3.1 Anthropic Client-Side API
**File:** `frontend/src/api/anthropicClient.ts`
- [x] Implement direct calls to Anthropic API using fetch
- [x] Handle Claude messages API format
- [x] Support text generation with context items
- [x] Support image inputs (base64)
- [x] Handle API errors gracefully
- [x] Note: May require CORS considerations - Anthropic API supports browser calls with API key

#### 3.2 Google/Gemini Client-Side API
**File:** `frontend/src/api/googleClient.ts`
- [x] Implement direct calls to Google Generative AI API
- [x] Support Gemini text generation
- [x] Support Imagen image generation
- [x] Handle API errors gracefully

#### 3.3 Modify LLM API Router
**File:** `frontend/src/api/llm.ts`
- [x] Import `isOfflineMode` from storage
- [x] Import client-side API modules
- [x] Modify `generateFromPrompt()`:
  - If offline + has Anthropic key: use anthropicClient
  - If offline + no key: throw descriptive error
  - If online: use existing backend endpoint
- [x] Modify `generateImage()`:
  - If offline + has Google key: use googleClient
  - If offline + no key: throw descriptive error
  - If online: use existing backend endpoint
- [x] Modify `generateHtml()`: same pattern as generateFromPrompt

### Phase 4: User Experience

#### 4.1 Error Handling & Feedback
- [x] Show clear error when attempting AI features without configured keys
- [x] Add toast/notification when API call fails due to invalid key
- [x] Guide user to Settings dialog when keys are missing

#### 4.2 Status Indication
**File:** `frontend/src/components/StatusBar.tsx`
- [x] Consider showing API key status in offline mode (e.g., "Offline - API keys configured")
- [x] Or show warning icon if in offline mode without keys

---

## Security Considerations

1. **API keys in localStorage**: Users should understand their keys are stored in the browser. Add appropriate warnings in the UI.

2. **No server-side exposure**: Keys never leave the browser in offline mode - calls go directly to API providers.

3. **Basic obfuscation only**: We can base64 encode or use simple obfuscation, but this is NOT security - just prevents casual inspection. True encryption would require a user password.

4. **Clear key option**: Users should be able to easily remove their keys.

---

## CORS Considerations

- **Anthropic API**: Supports direct browser calls with `anthropic-dangerous-direct-browser-access: true` header
- **Google AI API**: Generally supports browser calls with API key authentication

If CORS issues arise, alternatives:
1. Document that users need to use a browser extension to bypass CORS
2. Provide a simple proxy option they can self-host
3. Use a serverless function approach

---

## Testing Checklist

- [ ] Settings dialog opens from Edit menu
- [ ] API keys save to localStorage correctly
- [ ] API keys persist across page reloads
- [ ] API keys can be cleared
- [ ] LLM prompt works in offline mode with valid Anthropic key
- [ ] Image generation works in offline mode with valid Google key
- [ ] HTML generation works in offline mode with valid Anthropic key
- [ ] Appropriate errors shown when keys are missing
- [ ] Appropriate errors shown when keys are invalid
- [ ] Online mode continues to work unchanged (uses backend)

---

## Future Enhancements (Out of Scope)

- Additional settings tabs (appearance, keyboard shortcuts, etc.)
- Support for other LLM providers (OpenAI, etc.)
- API key validation on save (test call)
- Usage tracking/rate limiting awareness
- Import/export settings





# TODO: Add Header and Label to Images

## Overview
Add a header bar to images (like videos have) that displays:
- Editable label (left side) - from filename or auto-generated "Image1", "Image2", etc.
- Original/cropped dimensions + file size in KB (right side)
- Header only visible when image is selected

do the work in a feature branch

## Tasks

### 1. Update ImageItem type (frontend)
**File:** `frontend/src/types/index.ts`
- Add `name?: string` - editable label displayed in header
- Add `originalWidth?: number` - original pixel width
- Add `originalHeight?: number` - original pixel height
- Add `fileSize?: number` - file size in bytes

### 2. Update StoredImageItem type and save/load logic (backend)
**File:** `backend/src/routes/scenes.ts`

**Update StoredImageItem interface** (~line 35-43):
- Add `name?: string`
- Add `originalWidth?: number`
- Add `originalHeight?: number`
- Add `fileSize?: number`

**Update save logic** (~line 243-256, where image items are pushed to storedItems):
- Add `name: item.name`
- Add `originalWidth: item.originalWidth`
- Add `originalHeight: item.originalHeight`
- Add `fileSize: item.fileSize`

**Update load logic** (~line 490-506, where image items are returned):
- Add `name: item.name`
- Add `originalWidth: item.originalWidth`
- Add `originalHeight: item.originalHeight`
- Add `fileSize: item.fileSize`

### 3. Add IMAGE_HEADER_HEIGHT constant
**File:** `frontend/src/constants/canvas.ts`
- Add `export const IMAGE_HEADER_HEIGHT = 24` (same as VIDEO_HEADER_HEIGHT)

### 4. Create unique image name utility
**File:** `frontend/src/utils/imageNames.ts` (new file)
- Create `generateUniqueImageName(baseName: string, existingNames: string[]): string`
- For filenames: strip extension, check if name exists, append "2", "3", etc.
- For pasted images: use base "Image", generate "Image1", "Image2", etc.
- Examples:
  - `generateUniqueImageName("photo.png", [])` → "photo"
  - `generateUniqueImageName("photo.png", ["photo"])` → "photo2"
  - `generateUniqueImageName("Image", ["Image1", "Image2"])` → "Image3"

### 5. Create getImageDimensions utility
**File:** `frontend/src/api/images.ts`
- Add `getImageDimensions(file: File): Promise<{ width: number; height: number; fileSize: number }>`
- Similar pattern to `getVideoDimensions` in `api/videos.ts`
- Uses Image element to get natural dimensions

### 6. Update addImageAt function signature
**File:** `frontend/src/App.tsx`
- Change signature from:
  `addImageAt(x, y, src, width, height)`
- To:
  `addImageAt(x, y, src, width, height, name?, originalWidth?, originalHeight?, fileSize?)`
- Store all new values in the ImageItem
- Pass existing image names to unique name utility

### 7. Update onAddImageAt interface
**File:** `frontend/src/components/InfiniteCanvas.tsx`
- Update `InfiniteCanvasProps.onAddImageAt` signature to include new parameters

### 8. Update image drop handler
**File:** `frontend/src/components/InfiniteCanvas.tsx` (handleDrop function, ~line 304)
- Extract filename without extension: `file.name.replace(/\.[^/.]+$/, '')`
- Get file size from `file.size`
- Get original dimensions from loaded image (`img.naturalWidth`, `img.naturalHeight`)
- Pass all values to `onAddImageAt`

### 9. Update clipboard paste handlers
**File:** `frontend/src/hooks/useClipboard.ts`
- For pasted images (no filename), use base name "Image"
- Get file size from blob: `blob.size`
- Get original dimensions from loaded image
- Update both:
  - `handlePaste` (~line 91, 98, 102)
  - `handleContextMenuPaste` (~line 258, 265, 269)

### 10. Update ImageItemRenderer to show header
**File:** `frontend/src/components/canvas/items/ImageItemRenderer.tsx`
- Import `Group`, `Rect`, `Text` from react-konva
- Import `IMAGE_HEADER_HEIGHT` from constants
- Add `formatFileSize` helper (same as VideoItemRenderer)
- Wrap render in `<Group>` (like VideoItemRenderer)
- Calculate `headerHeight = isSelected ? IMAGE_HEADER_HEIGHT : 0`
- Build metadata string: dimensions × file size (show cropped if cropRect exists)
- Render header bar when selected:
  - `<Rect>` for header background (same styling as video: #2a2a4e, blue stroke)
  - `<Text>` for label (left, x=8, y=4, bold, #e0e0e0)
  - `<Text>` for metadata (right-aligned, x=displayWidth-158, #a0a0a0)
- Add `onLabelDblClick` prop for editing trigger
- Add `editingImageLabelId` prop to hide label text during edit

### 11. Create ImageLabelEditingOverlay
**File:** `frontend/src/components/canvas/overlays/ImageLabelEditingOverlay.tsx` (new file)
- Based on `VideoLabelEditingOverlay.tsx`
- Props: `item: ImageItem`, `inputRef`, `stageScale`, `stagePos`, `onBlur`, `onKeyDown`
- Position input in header bar above image
- Use `IMAGE_HEADER_HEIGHT` for positioning

### 12. Wire up label editing in InfiniteCanvas
**File:** `frontend/src/components/InfiniteCanvas.tsx`
- Add state: `editingImageLabelId: string | null`
- Add ref: `imageLabelInputRef`
- Add handler: `handleImageLabelDblClick(id: string)`
- Pass `onLabelDblClick` and `editingImageLabelId` to ImageItemRenderer
- Render `<ImageLabelEditingOverlay>` when `editingImageLabelId` is set
- On blur/Enter: update item name via `onUpdateItem`

### 13. Add undo/redo support for image name edits
**File:** `frontend/src/App.tsx`

Note: Video name edits currently lack undo/redo support - this task fixes it for images (and optionally videos).

**Create new change class** (in `frontend/src/utils/changeHistory.ts` or similar):
- Create `UpdateNameChange` class with `id`, `oldName`, `newName`
- Implement `apply()` and `reverse()` methods

**Update `updateItem` function** (~line 720):
- Add check: `const hasName = 'name' in changes && (item.type === 'image' || item.type === 'video')`
- Add handler to create `UpdateNameChange` record when name changes
- Only record if `item.name !== changes.name`

### 14. Ensure transformer works with new Group structure
- Verify image transformer attaches correctly to Group
- May need to adjust transformer attachment logic in InfiniteCanvas

## Testing Checklist
- [ ] Drop image file - label shows filename (without extension)
- [ ] Drop duplicate filename - label shows "filename2", etc.
- [ ] Paste image - label shows "Image1", "Image2", etc.
- [ ] Header only visible when image is selected
- [ ] Double-click label to edit
- [ ] Dimensions show original dimensions
- [ ] Cropped image shows cropped dimensions
- [ ] File size displays in KB/MB format
- [ ] Transform (scale/rotate) works correctly
- [ ] Crop mode works correctly
- [ ] Selection/deselection works correctly
- [ ] Save and reload scene - image name/metadata persists
- [ ] Undo/redo label edit works correctly













# TODO: Improve Image Cropping UI

## Goal
Add a control panel below the image crop overlay (similar to video cropping) with:
- X, Y, Width, Height input fields
- Aspect ratio lock button

## Current State
- **Image crop** (`ImageCropOverlay.tsx`): Konva-based, visual handles only, no control panel
- **Video crop** (`VideoCropOverlay.tsx`): HTML overlay with full control panel (X/Y/W/H fields, aspect lock, speed, trim, etc.)

## Implementation Plan

### 1. Convert ImageCropOverlay from Konva to HTML overlay
The current image crop uses Konva (canvas layer) while video crop uses HTML positioned over the canvas. To add a control panel, we need to match the video approach.

**Changes to `ImageCropOverlay.tsx`:**
- Convert from `react-konva` components to HTML `<div>` elements
- Position absolutely over the canvas (like VideoCropOverlay)
- Use CSS for the crop region visualization (dimmed overlay areas)
- Keep the 8 drag handles but render as HTML elements

### 2. Add control panel UI
**Add below the crop overlay (matching video style):**
- X input field (crop region left offset in source pixels)
- Y input field (crop region top offset in source pixels)
- Width input field (crop region width in source pixels)
- Height input field (crop region height in source pixels)
- Aspect ratio lock button (🔒/🔓)

**Styling:** Match video crop panel - dark background, white text, compact layout

### 3. Implement aspect ratio lock logic
**Add to `useCropMode.ts` hook:**
- `lockAspectRatio` state (boolean)
- `aspectRatio` ref to store locked ratio when enabled
- Modify resize logic to maintain aspect ratio when locked

**Handle resize with locked aspect ratio:**
- For corner handles: adjust both dimensions proportionally
- For edge handles: adjust the perpendicular dimension to maintain ratio

### 4. Add input field state management
**Pattern from video crop:**
- Local `inputValues` state for the text fields
- Sync from drag operations via useEffect
- Commit on blur or Enter key
- Validate and clamp values before applying

### 5. Update InfiniteCanvas integration
- The current Konva-based overlay is rendered inside the Stage
- HTML overlay needs to be rendered outside Stage but positioned relative to canvas
- May need to pass stage position/scale to the overlay component

## Files to Modify
1. `frontend/src/components/ImageCropOverlay.tsx` - Major rewrite (Konva → HTML)
2. `frontend/src/hooks/useCropMode.ts` - Add aspect lock state/logic
3. `frontend/src/components/InfiniteCanvas.tsx` - Update overlay integration

## Testing Checklist
- [ ] Crop handles work (drag to resize)
- [ ] Crop body drag works (move crop region)
- [ ] X/Y/W/H fields update when dragging
- [ ] Typing in fields updates crop region
- [ ] Aspect ratio lock maintains ratio during resize
- [ ] Enter/Escape keyboard shortcuts still work
- [ ] Crop overlay positions correctly when panning/zooming canvas
- [ ] Apply crop produces correct result







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







# GIF Support Implementation

## Context
Animated GIFs dropped onto the canvas displayed as static images because `canvas.drawImage()` cannot reliably access animated GIF frames — Chrome decodes images in "static" mode when loaded via `new Image()`, and no combination of `batchDraw()`, `Konva.Animation`, or DOM attachment after load fixes this. Additionally, server-side image cropping always output PNG via `sharp`, stripping GIF animation, and the scene save endpoint hardcoded `.png` for all image files.

## Solution
GIF items use a DOM `<img>` overlay positioned over the Konva canvas (the same pattern used for video and HTML iframe items). The browser handles GIF animation natively with zero extra memory cost.

## Changes

### 1. GIF detection utility
**New file:** `frontend/src/utils/gif.ts`
- `isGifSrc(src: string): boolean` — checks if source is a GIF by data URL MIME type (`data:image/gif`) or URL extension (`.gif`)

### 2. GIF detection hook
**New file:** `frontend/src/hooks/useGifAnimation.ts`
- Takes `items: CanvasItem[]`, returns `Set<string>` of image item IDs that are GIFs
- Pure detection — no animation logic needed since the DOM overlay handles playback

### 3. GIF overlay component
**New file:** `frontend/src/components/canvas/overlays/GifOverlay.tsx`
- DOM `<img>` element positioned absolutely over the Konva canvas
- Tracks the Konva item's position live during drag via `transform` prop (same pattern as `VideoOverlay`)
- Supports CSS-based cropping while waiting for server-side crop result
- Uses `cropSrc` when available (server-generated `.crop.gif`)

### 4. ImageItemRenderer changes
**Modified:** `frontend/src/components/canvas/items/ImageItemRenderer.tsx`
- Added `isGif` and `setGifItemTransforms` props
- When `isGif` is true, renders a transparent `Rect` for hit detection instead of Konva `Image`
- Tracks drag transforms via `onDragStart/Move/End` to keep the overlay in sync (same pattern as `VideoItemRenderer`)

### 5. InfiniteCanvas wiring
**Modified:** `frontend/src/components/InfiniteCanvas.tsx`
- Added `gifItemTransforms` state for live drag tracking
- Calls `useGifAnimation(items)` to get the set of GIF item IDs
- Passes `isGif` and `setGifItemTransforms` to `ImageItemRenderer`
- Renders `GifOverlay` components for GIF items (positioned after the Stage)
- Shows `ProcessingOverlay` with "Processing GIF..." during server-side crop

### 6. Processing spinner for GIF crops
**Modified:** `frontend/src/hooks/useCropMode.ts`
- Added `processingImageId` state, set during the server-side `cropImage()` call
- Exposed in the `CropMode` interface so InfiniteCanvas can show a spinner for GIF crops
- Non-GIF image crops are unaffected (their Konva client-side crop looks correct immediately)

### 7. Server-side GIF cropping with ffmpeg
**Modified:** `backend/src/routes/items.ts` — `crop-image` endpoint
- Tracks which file extension matched when finding the source file
- If extension is `gif`, uses ffmpeg with palette-preserving complex filter instead of sharp:
  ```
  [0:v]crop=w:h:x:y,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse
  ```
- Saves as `{imageId}.crop.gif` with content type `image/gif`
- Non-GIF images continue using existing sharp path unchanged

### 8. Scene save/load fix for image extensions
**Modified:** `backend/src/routes/scenes.ts`
- Scene save was hardcoding `${itemId}.png` for all image files
- Now extracts the actual extension from the source URL (data URL MIME or URL path), matching the existing video pattern
- Supports png, jpg, jpeg, gif, webp, svg, bmp

### 9. Debug menu fix (unrelated)
**Modified:** `frontend/src/App.tsx`
- Fixed server scene.json fetch URL: was `/api/scenes/:id/raw`, should be `/api/w/:workspace/scenes/:id/raw`

## Files Summary
| File | Action |
|------|--------|
| `frontend/src/utils/gif.ts` | Create |
| `frontend/src/hooks/useGifAnimation.ts` | Create |
| `frontend/src/components/canvas/overlays/GifOverlay.tsx` | Create |
| `frontend/src/components/canvas/items/ImageItemRenderer.tsx` | Add GIF mode (transparent rect + transform tracking) |
| `frontend/src/components/InfiniteCanvas.tsx` | Wire up GIF detection, overlays, transforms, processing spinner |
| `frontend/src/hooks/useCropMode.ts` | Add processingImageId state |
| `backend/src/routes/items.ts` | Branch crop-image on GIF format (ffmpeg) |
| `backend/src/routes/scenes.ts` | Preserve image file extension |
| `frontend/src/App.tsx` | Fix debug menu URL |







# Plan: Video ↔ GIF Conversion

do this work in a feature stream

## Context
Users want to convert video objects to GIFs and GIF objects (which are `ImageItem` with `.gif` src) to videos. The conversion uses ffmpeg on the server, and the result is added to the canvas as a new item (like duplicate does).

## Design

### 1. Backend: New endpoint `POST /api/w/:workspace/items/convert-media`

**File:** `backend/src/routes/items.ts`

Request body:
```json
{
  "sceneId": "uuid",
  "itemId": "uuid",
  "targetFormat": "gif" | "mp4",
  "isEdit": boolean,
  "extension": "mp4" | "gif" | "webm" | etc.
}
```

Logic:
- Validates sceneId/itemId are UUIDs, targetFormat is "gif" or "mp4"
- Client specifies `isEdit` (true = use `.crop.{ext}`, false = use `.{ext}`) and `extension` (source file extension)
- Constructs the storage key: `{workspace}/{sceneId}/{itemId}{isEdit ? '.crop' : ''}.{extension}`
- Loads the source file from storage
- Writes source to temp file
- Uses ffmpeg to convert:
  - **Video → GIF**: `ffmpeg -i input.mp4 → split → palettegen → paletteuse → output.gif` (same palette-preserving pattern used by crop-image for GIFs)
  - **GIF → MP4**: `ffmpeg -i input.gif -c:v libx264 -preset fast -crf 23 -movflags +faststart -pix_fmt yuv420p output.mp4` (standard H.264 encode, `pix_fmt yuv420p` needed because GIFs can have odd pixel formats)
- Generates a new itemId for the result
- Saves to `{sceneFolder}/{newItemId}.{gif|mp4}`
- Returns `{ success: true, url, newItemId, width, height }` (uses ffprobe to get output dimensions)
- Cleans up temp files

### 2. Frontend: New API function `convertMedia`

**File:** `frontend/src/api/videos.ts` (add to existing file)

```typescript
export async function convertMedia(
  sceneId: string,
  itemId: string,
  targetFormat: 'gif' | 'mp4',
  isEdit: boolean,
  extension: string
): Promise<{ url: string; newItemId: string; width: number; height: number }>
```

### 3. Frontend: New conversion function in `sceneOperations.ts`

**File:** `frontend/src/utils/sceneOperations.ts`

Add `convertToGif(sceneId, videoItem)` and `convertToVideo(sceneId, imageItem)` functions that:
1. Determine `isEdit` from item state (e.g., video has cropRect/speedFactor/removeAudio/trim; GIF has cropRect)
2. Determine `extension` from item src (edited videos are always `mp4`; edited GIFs are always `gif`)
3. Call `convertMedia` API with the explicit parameters
4. Return the info needed to add the new item (similar to `DuplicateImageResult`/`DuplicateVideoResult`)
5. Position the new item to the right of the source (same gap pattern as duplicate)

### 4. Frontend: Add "Convert to GIF" to VideoContextMenu

**File:** `frontend/src/components/canvas/menus/VideoContextMenu.tsx`

- Add new prop: `onConvertToGif: (videoItem: VideoItem) => void`
- Add "Convert to GIF" menu button (disabled when offline, like Edit/Duplicate)
- Calls `onConvertToGif(videoItem)` and closes menu

### 5. Frontend: Add "Convert to Video" to ImageContextMenu

**File:** `frontend/src/components/canvas/menus/ImageContextMenu.tsx`

- Add new prop: `onConvertToVideo: (imageItem: ImageItem) => void`
- Only show the button when the image is a GIF (use `isGifSrc()` from `utils/gif.ts`)
- Add "Convert to Video" menu button (disabled when offline)
- Calls `onConvertToVideo(imageItem)` and closes menu

### 6. Frontend: Wire up handlers in InfiniteCanvas.tsx

**File:** `frontend/src/components/InfiniteCanvas.tsx`

- Add `handleConvertVideoToGif` callback (similar to `handleDuplicateVideo`):
  - Calls `convertToGif()` from sceneOperations
  - Calls `onAddImageAt()` with the result to add as new GIF image item
- Add `handleConvertGifToVideo` callback (similar to `handleDuplicateImage`):
  - Calls `convertToVideo()` from sceneOperations
  - Calls `onAddVideoAt()` with the result to add as new video item
- Pass these as props to the context menus

## Files Modified

1. `backend/src/routes/items.ts` — new `convert-media` endpoint
2. `frontend/src/api/videos.ts` — new `convertMedia()` API function
3. `frontend/src/utils/sceneOperations.ts` — new `convertToGif()` and `convertToVideo()` functions
4. `frontend/src/components/canvas/menus/VideoContextMenu.tsx` — "Convert to GIF" button + handler prop
5. `frontend/src/components/canvas/menus/ImageContextMenu.tsx` — "Convert to Video" button (GIF only) + handler prop
6. `frontend/src/components/InfiniteCanvas.tsx` — wire up conversion handlers and pass to menus

## Verification

1. Start backend (`npm run dev` in `/backend`) and frontend (`npm run dev` in `/frontend`)
2. Add a video to the canvas → right-click → "Convert to GIF" → new GIF image item appears to the right
3. Add a GIF to the canvas → right-click → "Convert to Video" → new video item appears to the right
4. Test with edited video (cropped/trimmed) → should convert the edited version
5. Test with cropped GIF → should convert the cropped version
6. Verify offline mode disables the conversion buttons
