# TODO

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





