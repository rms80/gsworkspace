# TODO

## Video Block Support

### Status: Core Implementation Complete

The basic video support is now implemented. Below is the original plan with completed items marked.

### Requirements
- [x] **Add via**: File picker (Add menu)
- [x] **Playback**: Play/pause controls, seek slider
- [x] **Options**: Loop toggle, mute/unmute (muted by default)
- [x] **Storage**: Upload to S3 (online mode)
- [x] **Feature flag**: Can be disabled via config
- [ ] **Storage**: IndexedDB persistence for offline mode (videos use temporary blob URLs currently)
- [ ] **Drag-drop**: Add video via drag-drop

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

#### Phase 6: Drag-Drop Support - NOT DONE

- [ ] Handle video files on drag-drop
- [ ] Show loading indicator during upload

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

1. **Drag-drop support** - Add video files via drag-drop onto canvas
2. **Offline persistence** - Store video blobs in IndexedDB so they persist across page reloads
3. **Upload progress** - Show progress indicator for large video uploads
4. **Video proxy endpoint** - For CORS issues when exporting external videos

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
