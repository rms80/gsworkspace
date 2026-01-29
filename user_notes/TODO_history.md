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



