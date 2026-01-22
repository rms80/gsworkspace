# TODO


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




