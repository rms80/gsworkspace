# TODO

## Video Cropping Implementation Plan

### Overview
Add video cropping support using server-side ffmpeg (fluent-ffmpeg). Similar to image cropping, generates `filename.crop.mp4` on the server. Includes processing visualization with spinner. Crop functionality hidden when offline.

### Branch
`feature/video-crop`

---

### Phase 1: Backend Setup

#### 1.1 Install fluent-ffmpeg and ffmpeg-static
```bash
cd backend
npm install fluent-ffmpeg ffmpeg-static
npm install --save-dev @types/fluent-ffmpeg
```

This bundles the ffmpeg binary within `node_modules` - no system installation required.

Configure in code:
```javascript
const ffmpegStatic = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegStatic);
```

#### 1.2 Add crop-video endpoint
**File:** `backend/src/routes/items.ts`

Add `POST /api/items/crop-video` endpoint:
- Accept `{ src: string, cropRect: { x, y, width, height } }`
- Download video to temp file
- Use ffmpeg crop filter: `crop=width:height:x:y`
- Ensure even dimensions (required by H.264): round to nearest even number
- Upload result to S3 as `{basePath}.crop.mp4`
- Clean up temp files
- Return `{ success: true, url: string }`

---

### Phase 2: Type Definitions

#### 2.1 Update VideoItem type
**File:** `frontend/src/types/index.ts`

Add to VideoItem interface:
```typescript
cropRect?: CropRect      // Crop region in source video pixels
cropSrc?: string         // S3 URL of cropped video file
```

#### 2.2 Add cropVideo API function
**File:** `frontend/src/api/videos.ts`

Add function similar to `cropImage()` in `api/images.ts`

---

### Phase 3: Processing Overlay Component

#### 3.1 Create ProcessingOverlay
**File:** `frontend/src/components/canvas/overlays/ProcessingOverlay.tsx`

- Dark semi-transparent overlay covering item bounds
- Centered CSS spinner animation
- Text: "Processing video..."
- Positioned using same transform logic as VideoOverlay

---

### Phase 4: Video Crop Mode Hook

#### 4.1 Create useVideoCropMode hook
**File:** `frontend/src/hooks/useVideoCropMode.ts`

Follow pattern from `useCropMode.ts`:
- Track `croppingVideoId: string | null`
- Track `pendingCropRect: CropRect | null`
- Track `processingVideoId: string | null` (for spinner)
- `startCrop(id, initialRect)` - enter crop mode
- `applyCrop()` - update item, call API, show spinner
- `cancelCrop()` - exit without changes

---

### Phase 5: Video Crop Overlay UI

#### 5.1 Create VideoCropOverlay
**File:** `frontend/src/components/canvas/overlays/VideoCropOverlay.tsx`

Similar to ImageCropOverlay but as HTML overlay (not Konva):
- Pause video during crop
- Show video frame with crop region highlighted
- 8 drag handles (corners + edges)
- Drag center to move crop region
- Enter to apply, Escape to cancel
- Minimum crop size: 10px
- Clamp to video bounds

---

### Phase 6: Integration

#### 6.1 Update VideoContextMenu
**File:** `frontend/src/components/canvas/menus/VideoContextMenu.tsx`

- Add "Crop" menu item (disabled when offline)
- Add "Remove Crop" menu item (only when cropRect exists)

#### 6.2 Update VideoItemRenderer
**File:** `frontend/src/components/canvas/items/VideoItemRenderer.tsx`

- Pass crop mode state
- Conditionally render crop overlay

#### 6.3 Update VideoOverlay
**File:** `frontend/src/components/canvas/overlays/VideoOverlay.tsx`

- Apply CSS to show only cropped region when `cropRect` exists
- Use `object-position` and `clip-path` or adjust video sizing

#### 6.4 Update InfiniteCanvas
**File:** `frontend/src/components/InfiniteCanvas.tsx`

- Import and use `useVideoCropMode` hook
- Render `ProcessingOverlay` when `processingVideoId` is set
- Wire up context menu crop action
- Handle keyboard (Enter/Escape) during crop mode

---

### Files Summary

**Create:**
- `frontend/src/components/canvas/overlays/ProcessingOverlay.tsx`
- `frontend/src/components/canvas/overlays/VideoCropOverlay.tsx`
- `frontend/src/hooks/useVideoCropMode.ts`

**Modify:**
- `backend/package.json` - add fluent-ffmpeg
- `backend/src/routes/items.ts` - add crop-video endpoint
- `frontend/src/types/index.ts` - add cropRect/cropSrc to VideoItem
- `frontend/src/api/videos.ts` - add cropVideo function
- `frontend/src/components/canvas/menus/VideoContextMenu.tsx` - add Crop menu items
- `frontend/src/components/canvas/items/VideoItemRenderer.tsx` - integrate crop overlay
- `frontend/src/components/canvas/overlays/VideoOverlay.tsx` - apply crop styling
- `frontend/src/components/InfiniteCanvas.tsx` - integrate hook and processing overlay

---

### Verification

1. **Backend test:** Use curl/Postman to POST to `/api/items/crop-video` with a video URL and crop rect
2. **UI test:** Right-click video > Crop > adjust handles > press Enter
3. **Spinner test:** Verify spinner appears during processing
4. **Offline test:** Verify "Crop" is disabled when offline
5. **Result test:** Verify cropped video plays correctly with new dimensions

---

### Considerations

- **Even dimensions:** FFmpeg H.264 requires even width/height - round to nearest even
- **Large videos:** May take time - spinner essential for UX
- **Temp file cleanup:** Ensure cleanup on both success and error paths
- **Offline mode:** Crop menu item hidden/disabled when `isOffline` is true
