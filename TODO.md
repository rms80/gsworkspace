# TODO


## InfiniteCanvas.tsx Refactoring Plan

The file is currently **2,158 lines**. After the first round of hook extraction (viewport, selection, crop, clipboard, prompt editing), the remaining bulk is item renderers, editing overlays, and context menus — all inline JSX and handler functions. The goal is to extract these into focused components and hooks, bringing InfiniteCanvas down to ~400-500 lines as a thin orchestrator.

### Phase 1: Extract Item Renderers (~800 lines) ✅

Extracted into `components/canvas/items/`. The generic `PromptItemRenderer` replaced 3 duplicated prompt blocks.

- [x] **`TextItemRenderer.tsx`** — Group with Rect+Text, drag/transform handlers, double-click to edit
- [x] **`ImageItemRenderer.tsx`** — KonvaImage with crop overlay branch, right-click context menu trigger, transform handlers
- [x] **`PromptItemRenderer.tsx`** — Generic renderer used for all 3 prompt types (prompt, image-gen-prompt, html-gen-prompt) via theme config prop
- [x] **`HtmlItemRenderer.tsx`** — Header bar with label, export/zoom buttons, content rect, drag/transform with real-time iframe sync

### Phase 2: Extract Editing Overlays (~240 lines)

HTML overlay elements positioned absolutely on top of the Konva Stage for text editing.

- [ ] **`TextEditingOverlay.tsx`** (~45 lines) — Textarea overlay for text item editing (lines ~1443-1485)
- [ ] **`PromptEditingOverlay.tsx`** (~60 lines, generic) — Input for label + textarea for text, parameterized by color/position. Currently duplicated 3 times (lines ~1487-1674). One component replaces all three
- [ ] **`HtmlLabelEditingOverlay.tsx`** (~30 lines) — Input overlay for HTML item label (lines ~1676-1702)

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



