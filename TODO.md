# TODO

## Video Block Support

### Overview
Add inline video blocks to the canvas, similar to image blocks but with playback controls.

### Requirements
- **Add via**: File picker (Add menu) and drag-drop
- **Playback**: Play/pause controls, seek slider
- **Options**: Loop toggle, mute/unmute (muted by default)
- **Storage**: Upload to S3 like images
- **No support for**: Paste, URL input, autoplay

---

### Implementation Plan

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

#### Phase 2: Backend - Video Upload

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
   export async function uploadVideo(file: File): Promise<string>
   ```

2. **Update MenuBar** (`frontend/src/components/MenuBar.tsx`)
   - Add "Video" option to Add menu
   - File input accepting video/* types
   - Call upload and add video item

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

---

### File Changes Summary

**New Files:**
- `frontend/src/api/videos.ts`
- `frontend/src/components/canvas/items/VideoItemRenderer.tsx`
- `frontend/src/components/canvas/overlays/VideoControlsOverlay.tsx`

**Modified Files:**
- `frontend/src/types/index.ts` - Add VideoItem type
- `frontend/src/components/MenuBar.tsx` - Add Video menu option
- `frontend/src/components/InfiniteCanvas.tsx` - Render video items
- `frontend/src/App.tsx` - Add video handling
- `backend/src/routes/items.ts` - Video upload endpoint
- `backend/src/routes/scenes.ts` - Video save/load
- `frontend/src/utils/sceneExport.ts` - Export videos
- `frontend/src/utils/sceneImport.ts` - Import videos
