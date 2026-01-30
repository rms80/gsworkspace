# TODO

## Video Block Support

### Overview
Add inline video blocks to the canvas, similar to image blocks but with playback controls.

### Requirements
- **Add via**: File picker (Add menu) and drag-drop
- **Playback**: Play/pause controls, seek slider
- **Options**: Loop toggle, mute/unmute (muted by default)
- **Storage**: Upload to S3 like images (online), IndexedDB (offline)
- **Feature flag**: Can be disabled via config
- **No support for**: Paste, URL input, autoplay

---

### Implementation Plan

#### Phase 0: Feature Flag

1. **Add feature flag** (`frontend/src/config.ts`)
   ```typescript
   export const FEATURES = {
     VIDEO_SUPPORT: import.meta.env.VITE_FEATURE_VIDEO !== 'false', // enabled by default
   }
   ```

2. **Add environment variable** (`frontend/.env.example`)
   ```
   VITE_FEATURE_VIDEO=true
   ```

3. **Gate UI elements behind flag**
   - Hide "Video" option in Add menu when disabled
   - Ignore video files on drag-drop when disabled
   - Existing video items still render (for backwards compatibility)

#### Phase 1: Types & Data Model

1. **Add VideoItem type** (`frontend/src/types/index.ts`)
   ```typescript
   export interface VideoItem extends BaseItem {
     type: 'video'
     src: string           // S3 URL
     width: number
     height: number
     scaleX?: number
     scaleY?: number
     rotation?: number
     loop?: boolean        // default false
     muted?: boolean       // default true
   }
   ```

2. **Update CanvasItem union type** to include VideoItem

3. **Update scene save/load** (`backend/src/routes/scenes.ts`)
   - Handle video items in save (copy video file to scene folder)
   - Handle video items in load (reconstruct URL)

#### Phase 2: Backend - Video Upload (Online Mode)

1. **Add video upload endpoint** (`backend/src/routes/items.ts`)
   - POST `/api/items/upload-video`
   - Accept video file (mp4, webm, mov)
   - Upload to S3 `videos/` folder
   - Return S3 URL
   - Consider file size limits

2. **Add video proxy endpoint** (if needed for CORS)

#### Phase 3: Frontend - Video Upload API

1. **Add uploadVideo function** (`frontend/src/api/videos.ts`)
   ```typescript
   export async function uploadVideo(file: File, isOffline: boolean): Promise<string>
   ```
   - **Online mode**: Upload to S3, return S3 URL
   - **Offline mode**: Store in IndexedDB, return blob URL or data URL

2. **Add IndexedDB video storage** (`frontend/src/api/storage/IndexedDBStorageProvider.ts`)
   - Store video blobs in IndexedDB (similar to how offline scenes work)
   - Return blob URLs for playback
   - Handle larger file sizes (videos can be 10-100MB+)

3. **Update MenuBar** (`frontend/src/components/MenuBar.tsx`)
   - Add "Video" option to Add menu
   - File input accepting video/* types
   - Call upload and add video item (respecting offline mode)

#### Phase 4: Video Item Renderer

1. **Create VideoItemRenderer** (`frontend/src/components/canvas/items/VideoItemRenderer.tsx`)
   - Use HTML5 `<video>` element positioned over canvas
   - Sync position/scale with canvas transforms
   - Handle selection state (show border when selected)
   - Support dragging and transform (resize/rotate)

2. **Video element management**
   - Create/destroy video elements as items enter/leave view
   - Manage video loading states

#### Phase 5: Playback Controls Overlay

1. **Create VideoControlsOverlay** (`frontend/src/components/canvas/overlays/VideoControlsOverlay.tsx`)
   - Appears when video is selected or hovered
   - Play/pause button
   - Seek slider (range input)
   - Current time / duration display
   - Mute/unmute toggle button
   - Loop toggle button
   - Position overlay relative to video item

2. **Playback state management**
   - Track playing/paused state per video
   - Track current time for seek slider
   - Sync with video element events

#### Phase 6: Drag-Drop Support

1. **Update InfiniteCanvas drag-drop handler**
   - Detect video files (video/* MIME type)
   - Upload video to S3
   - Create VideoItem at drop position
   - Show loading indicator during upload

#### Phase 7: Integration

1. **Update InfiniteCanvas.tsx**
   - Import and render VideoItemRenderer for video items
   - Add video items to transformer for resize/rotate
   - Handle video item selection

2. **Update App.tsx**
   - Add `addVideo` callback similar to `addImage`
   - Handle video items in scene state

3. **Update history/undo system**
   - Ensure AddObjectChange/DeleteObjectChange work with video items

#### Phase 8: Scene Persistence

1. **Update scene export** (`frontend/src/utils/sceneExport.ts`)
   - Include video files in ZIP export

2. **Update scene import** (`frontend/src/utils/sceneImport.ts`)
   - Handle video files in ZIP import

---

### Technical Considerations

1. **Konva + HTML Video**
   - Konva.Image can use video as source but requires manual frame updates
   - Alternative: Position HTML video elements over canvas (simpler, better performance)
   - Chosen approach: HTML video overlay (matches how text editing works)

2. **Performance**
   - Pause videos that are off-screen
   - Consider limiting simultaneous video playback
   - Large videos may need progress indication during upload

3. **File Size**
   - May need to set upload limits (e.g., 100MB)
   - Show upload progress for large files

4. **Supported Formats**
   - Primary: MP4 (H.264) - widest browser support
   - Also: WebM, MOV
   - Validate format before upload

5. **Offline Mode / IndexedDB Storage**
   - Store video blobs in IndexedDB when in offline mode
   - Use blob URLs (`URL.createObjectURL()`) for playback
   - IndexedDB can handle large blobs but has browser-specific limits
   - Consider chunked storage for very large videos
   - Scene save/load must handle both S3 URLs and blob references
   - When switching online→offline or vice versa, videos remain in original storage

---

### File Changes Summary

**New Files:**
- `frontend/src/api/videos.ts`
- `frontend/src/components/canvas/items/VideoItemRenderer.tsx`
- `frontend/src/components/canvas/overlays/VideoControlsOverlay.tsx`

**Modified Files:**
- `frontend/src/config.ts` - Add FEATURES.VIDEO_SUPPORT flag
- `frontend/.env.example` - Add VITE_FEATURE_VIDEO
- `frontend/src/types/index.ts` - Add VideoItem type
- `frontend/src/components/MenuBar.tsx` - Add Video menu option (gated by flag)
- `frontend/src/components/InfiniteCanvas.tsx` - Render video items, gate drag-drop
- `frontend/src/App.tsx` - Add video handling
- `backend/src/routes/items.ts` - Video upload endpoint
- `backend/src/routes/scenes.ts` - Video save/load
- `frontend/src/utils/sceneExport.ts` - Export videos
- `frontend/src/utils/sceneImport.ts` - Import videos
