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
