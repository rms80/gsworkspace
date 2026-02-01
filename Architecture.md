# Architecture

This document describes key architectural decisions and patterns in the Workspaceapp codebase.

## Media Storage (Images & Videos)

### Overview

Media files (images and videos) follow a two-stage storage pattern to balance immediate responsiveness with organized long-term storage.

### The Two-Stage Pattern

**Stage 1: Staging Upload (immediate)**

When a user pastes or drops an image/video onto the canvas, the file is immediately uploaded to a staging folder in S3:
- Images: `images/{uuid}-{filename}.png`
- Videos: `videos/{uuid}-{filename}.{ext}`

This happens via the `/api/items/upload-image` and `/api/items/upload-video` endpoints.

**Why immediate upload?**
- Avoids keeping large base64 data URLs in browser memory
- Keeps undo/redo history lightweight (stores S3 URLs instead of raw data)
- Provides immediate feedback to the user

**Stage 2: Scene Folder (on save)**

When the scene is saved, media files are copied from the staging folder to the scene's dedicated folder:
- Scene folder: `version0/{sceneId}/`
- Images become: `version0/{sceneId}/{itemId}.png`
- Videos become: `version0/{sceneId}/{itemId}.{ext}`

After successful copy, the original staging file is deleted to avoid duplication.

### Flow Diagram

```
User drops image
       │
       ▼
┌──────────────────┐
│ uploadImage()    │  Frontend calls /api/items/upload-image
│ → images/{uuid}  │  File stored in staging folder
└────────┬─────────┘
         │
         ▼
   Canvas shows image
   (using S3 URL)
         │
         ▼
   User saves scene
         │
         ▼
┌──────────────────────────────┐
│ POST /api/scenes/{id}        │
│                              │
│ 1. Fetch from staging URL    │
│ 2. Save to scene folder      │
│ 3. Delete staging file       │
└──────────────────────────────┘
         │
         ▼
   Image now at:
   version0/{sceneId}/{itemId}.png
```

### Special Cases

**Already in scene folder**: If an image URL already points to the current scene folder, no copy is made (avoids redundant work on re-saves).

**External URLs**: Images from external URLs are fetched and saved to the scene folder on first save.

**Data URLs**: If somehow a data URL reaches the save logic, it's decoded and saved directly to the scene folder.

### Related Files

- `frontend/src/api/images.ts` - `uploadImage()` for staging upload
- `frontend/src/api/videos.ts` - `uploadVideo()` for staging upload
- `backend/src/routes/items.ts` - `/upload-image`, `/upload-video` endpoints
- `backend/src/routes/scenes.ts` - Scene save logic with staging cleanup

---

## Scene Storage Format

### Overview

Scenes are stored in S3 with each scene in its own folder under `version0/{sceneId}/`.

### Folder Structure

```
version0/
  └── {sceneId}/
      ├── scene.json          # Scene metadata and item definitions
      ├── history.json        # Undo/redo history
      ├── {itemId}.png        # Image files
      ├── {itemId}.mp4        # Video files
      └── {itemId}.html       # HTML content files
```

### scene.json Format

The `scene.json` file contains all scene metadata and item definitions:

```json
{
  "id": "scene-uuid",
  "name": "My Scene",
  "createdAt": "2025-01-15T10:00:00.000Z",
  "modifiedAt": "2025-01-15T12:30:00.000Z",
  "items": [
    {
      "type": "text",
      "id": "item-1",
      "x": 100,
      "y": 200,
      "width": 300,
      "height": 50,
      "fontSize": 14,
      "text": "Hello world"
    },
    {
      "type": "prompt",
      "id": "item-2",
      "x": 400,
      "y": 200,
      "width": 300,
      "height": 100,
      "fontSize": 12,
      "label": "My Prompt",
      "text": "Describe this image...",
      "model": "claude-sonnet"
    },
    {
      "type": "image",
      "id": "item-3",
      "x": 100,
      "y": 300,
      "width": 400,
      "height": 300,
      "file": "item-3.png"
    },
    {
      "type": "html",
      "id": "item-4",
      "x": 500,
      "y": 300,
      "width": 400,
      "height": 300,
      "label": "Widget",
      "file": "item-4.html",
      "zoom": 1.0
    }
  ]
}
```

### Content Storage by Item Type

| Item Type | Content Location | Rationale |
|-----------|------------------|-----------|
| Text | Inline in scene.json (`text` field) | Small, frequently edited |
| Prompt | Inline in scene.json (`label`, `text`, `model`) | Small, frequently edited |
| ImageGen Prompt | Inline in scene.json | Small, frequently edited |
| HTMLGen Prompt | Inline in scene.json | Small, frequently edited |
| Image | Separate file (`{id}.png`) | Binary, potentially large |
| Video | Separate file (`{id}.{ext}`) | Binary, large |
| HTML | Separate file (`{id}.html`) | Can be large, contains embedded assets |

### Related Files

- `backend/src/routes/scenes.ts` - Save/load logic
- `frontend/src/types/index.ts` - TypeScript type definitions
