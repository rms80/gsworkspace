# Refactoring TODO

---

# App.tsx Refactoring Analysis

**File:** `frontend/src/App.tsx`
**Lines:** ~1600
**Status:** Many extractions complete; remaining items are lower priority

## Overview

App.tsx is the main application component. It has been significantly refactored from ~2735 lines down to ~1600 through extraction of hooks and services. The remaining items are lower priority.

---

## Completed Extractions

| # | Item | Extracted To | Status |
|---|------|-------------|--------|
| 2.1 | Item Factory Service | `services/itemFactory.ts` | Done |
| 2.2 | Item Positioning Service | `utils/itemPositioning.ts` | Done |
| 2.3 | Item Upload Handlers | `hooks/useItemUpload.ts` | Done |
| 3.1 | Coding Robot Manager | `hooks/useCodingRobotManager.ts` | Done |
| 4.1 | Auto-Save Manager | `hooks/useAutoSave.ts` | Done |
| 5.1 | Viewport Manager | `hooks/useViewportManager.ts` | Done |
| 6.1 | File Drop Handler | `hooks/useFileDrop.ts` | Done |
| 9.1 | Dialog Manager | `hooks/useDialogManager.ts` | Done |
| 10.1 | Prompt Execution Handlers | `hooks/usePromptExecution.ts` | Done |

---

## Remaining Extractions

### 1.1 Scene Management State
**Extract to:** `hooks/useSceneManager.ts`

**Includes:**
- `openScenes`, `setOpenScenes`
- `activeSceneId`, `setActiveSceneId`
- Scene operations: `addScene`, `selectScene`, `renameScene`, `closeScene`, `handleDeleteScene`
- Scene loading: `loadAllScenes`
- Save tracking: `lastSavedRef`, `persistedSceneIdsRef`

### 1.2 History Management State
**Extract to:** `hooks/useHistoryManager.ts`

**Includes:**
- `historyMap`, `setHistoryMap`
- `historyVersion`, `setHistoryVersion`
- `lastSavedHistoryRef`
- History operations: `pushChange`, `handleUndo`, `handleRedo`
- History persistence logic

### 1.4 Auth & Server State
**Extract to:** `hooks/useAuth.ts`

**Includes:**
- `authRequired`, `authenticated`
- `serverName`
- `handleLoginSuccess`, `handleLogout`
- Auth status checking logic

### 1.5 Storage & Offline State
**Extract to:** `hooks/useStorageMode.ts`

**Includes:**
- `isOffline`, `storageMode`
- `handleSetOfflineMode`, `handleStorageModeChange`, `handleStorageModeSync`
- Storage mode persistence

---

## Current Metrics

- **Lines of Code:** ~1600
- **useState Hooks:** 17
- **useCallback Functions:** 43
- **useEffect Hooks:** 8
- **useRef Hooks:** 7

---

## Notes

- This refactoring should be done incrementally, not all at once
- Some state will remain in App.tsx as it coordinates top-level concerns
- The remaining extractions (scene, history, auth, storage) are tightly coupled and may be harder to separate cleanly

---
---

# InfiniteCanvas.tsx Refactoring Analysis

**File:** `frontend/src/components/InfiniteCanvas.tsx`
**Lines:** ~2,378
**Status:** Not yet started

## Overview

InfiniteCanvas.tsx is the core canvas rendering and interaction component. It manages a Konva.js-based infinite canvas with support for 9+ content types (text, images, videos, PDFs, HTML, prompts, coding robots, text files, embed videos). The file already uses 12+ custom hooks for vertical concerns but still contains a massive amount of handler logic, rendering code, and state management that can be further extracted.

---

## Proposed Extractions (Priority Order)

### 1.1 Label Editing Hook
**Extract to:** `hooks/useLabelEditing.ts`
**Priority:** High — removes ~200 lines of duplicated patterns
**Estimated reduction:** ~200 lines

**Includes:**
- Consolidate 5 nearly-identical label editing state machines (HTML, Video, Image, PDF, TextFile)
- Each currently has: `editingXxxLabelId`, `xxxLabelText`, `handleXxxLabelDblClick`, `handleXxxLabelBlur`, `handleXxxLabelKeyDown`, `getEditingXxxItem`
- Replace with a generic `useLabelEditing(items, type)` that returns `{ editingId, labelText, handleDblClick, handleBlur, handleKeyDown, getEditingItem }`
- Or a single `useLabelEditing()` that manages all label types via a discriminated map

### 1.2 Multi-Select Drag Hook
**Extract to:** `hooks/useMultiSelectDrag.ts`
**Priority:** High — isolates the most complex interaction logic
**Estimated reduction:** ~180 lines

**Includes:**
- `multiDragRef` and its state tracking
- `handleLayerDragStart` — coordinates multi-item drag, detaches transformers
- `handleLayerDragMove` — moves other selected items in sync
- `handleLayerDragEnd` — completes drag, batches history entries, restores transformers
- `handleUpdateItem` wrapper that suppresses history during batch drags

### 1.3 File Drop & Conversion Hook
**Extract to:** `hooks/useCanvasFileDrop.ts`
**Priority:** High — large self-contained block
**Estimated reduction:** ~260 lines

**Includes:**
- `handleDragOver`, `handleDrop` — main file drag-and-drop handler (image, video, PDF, text files)
- `handleDuplicateImage`, `handleDuplicateVideo` — item duplication
- `handleConvertVideoToGif`, `handleConvertGifToVideo` — format conversion with placeholder management
- `conversionPlaceholders` state
- Upload placeholder logic (video upload progress)

### 1.4 Iframe Overlay Components
**Extract to:** `components/canvas-overlays/HtmlIframeOverlay.tsx`, `PdfIframeOverlay.tsx`, `TextFileIframeOverlay.tsx`, `EmbedVideoIframeOverlay.tsx`
**Priority:** Medium — significant rendering logic per overlay
**Estimated reduction:** ~230 lines

**Includes:**
- HTML iframe overlay: positioned absolutely, interactive when selected
- PDF iframe overlay: PDF.js viewer in iframes
- Text file iframe overlay: markdown rendering via `marked`, CSV table generation, raw text view, monospace toggle, font size control
- Embed video iframe overlay: YouTube embed with play button overlay
- Each overlay computes positioning from stage transform and item dimensions

### 1.5 Context Menus Wrapper Component
**Extract to:** `components/CanvasContextMenus.tsx`
**Priority:** Medium — straightforward extraction, reduces JSX bulk
**Estimated reduction:** ~180 lines

**Includes:**
- Canvas context menu (empty-space right-click)
- Model selector menus (3 instances: LLM, image-gen, html-gen)
- Image context menu, Video context menu, PDF context menu, Text file context menu
- Multi-select context menu, HTML export menu
- All 8+ context menu instances with their conditional rendering and callbacks

### 1.6 Editing Overlays Wrapper Component
**Extract to:** `components/CanvasEditingOverlays.tsx`
**Priority:** Medium — simple extraction
**Estimated reduction:** ~100 lines

**Includes:**
- Text editing overlay (1 instance)
- Prompt editing overlays (3 instances: prompt, image-gen, html-gen)
- Label editing overlays (5 instances: html, video, image, pdf, text-file)

### 1.7 Transformer Configuration Component
**Extract to:** `components/CanvasTransformers.tsx`
**Priority:** Low — mostly declarative but bulky
**Estimated reduction:** ~130 lines

**Includes:**
- 11 separate Transformer elements (text, image, prompt, image-gen prompt, html-gen prompt, coding robot, html, pdf, text file, video, embed video)
- Each has different configuration (corner-only vs 8-handle, aspect ratio locking, min size constraints)
- 11 transformer refs

### 1.8 Overlay Transform Tracking Hook
**Extract to:** `hooks/useOverlayTransforms.ts`
**Priority:** Low — small but cleans up scattered state
**Estimated reduction:** ~50 lines

**Includes:**
- 7 transform tracking state maps: `htmlItemTransforms`, `videoItemTransforms`, `gifItemTransforms`, `codingRobotItemTransforms`, `pdfItemTransforms`, `textFileItemTransforms`, `embedVideoItemTransforms`
- These track real-time transforms during drag to keep iframe/overlay positions in sync
- Currently scattered through the state management section

### 1.9 Text File Content Cache Hook
**Extract to:** `hooks/useTextFileContentCache.ts`
**Priority:** Low — small self-contained effect
**Estimated reduction:** ~35 lines

**Includes:**
- `textFileContents` state map
- `useEffect` that fetches and caches text file contents from backend
- Deduplication logic to avoid re-fetching

### 1.10 Quick Prompt State Hook
**Extract to:** `hooks/useQuickPrompt.ts`
**Priority:** Low — small but self-contained
**Estimated reduction:** ~40 lines

**Includes:**
- `quickPrompt` state (mode, position, target)
- `quickPromptPlaceholders` state
- Quick prompt overlay rendering logic
- Placeholder lifecycle management

---

## Extraction Summary

| # | Item | Extract To | Priority | Est. Lines Saved |
|---|------|-----------|----------|-----------------|
| 1.1 | Label Editing Hook | `hooks/useLabelEditing.ts` | High | ~200 |
| 1.2 | Multi-Select Drag Hook | `hooks/useMultiSelectDrag.ts` | High | ~180 |
| 1.3 | File Drop & Conversion | `hooks/useCanvasFileDrop.ts` | High | ~260 |
| 1.4 | Iframe Overlay Components | `components/canvas-overlays/*.tsx` | Medium | ~230 |
| 1.5 | Context Menus Wrapper | `components/CanvasContextMenus.tsx` | Medium | ~180 |
| 1.6 | Editing Overlays Wrapper | `components/CanvasEditingOverlays.tsx` | Medium | ~100 |
| 1.7 | Transformer Configuration | `components/CanvasTransformers.tsx` | Low | ~130 |
| 1.8 | Overlay Transform Tracking | `hooks/useOverlayTransforms.ts` | Low | ~50 |
| 1.9 | Text File Content Cache | `hooks/useTextFileContentCache.ts` | Low | ~35 |
| 1.10 | Quick Prompt State | `hooks/useQuickPrompt.ts` | Low | ~40 |
| | **Total** | | | **~1,405** |

**Projected file size after all extractions:** ~970 lines (down from ~2,378)

---

## Current Metrics

- **Lines of Code:** ~2,378
- **Custom Hooks Used:** 12+
- **Transformer Refs:** 11
- **Item Types Rendered:** 9
- **Context Menu Types:** 8+
- **Editing Overlay Types:** 9
- **Iframe Overlay Types:** 4

---

## Notes

- This refactoring should be done incrementally, starting with the High priority items
- The label editing consolidation (1.1) offers the best complexity-reduction-to-effort ratio since it eliminates 5x duplicated patterns
- The iframe overlay extraction (1.4) is particularly valuable because the text file overlay contains significant HTML generation and markdown parsing logic that clutters the main component
- Some extractions (1.5, 1.6, 1.7) are mostly "move JSX to a child component" — simple but effective at reducing visual noise
- The item rendering loop (mapping items to renderers) should remain in InfiniteCanvas.tsx as it's the core responsibility of the component
- After extraction, InfiniteCanvas.tsx should primarily contain: hook composition, the Konva Stage/Layer setup, the item rendering loop, and the imperative handle API
