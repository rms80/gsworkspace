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
