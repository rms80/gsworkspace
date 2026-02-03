# Architecture

This document describes key architectural decisions and patterns in the Workspaceapp codebase.

## Media Storage (Images & Videos)

### Overview

Media files (images and videos) follow a two-stage storage pattern to balance immediate responsiveness with organized long-term storage.

### The Two-Stage Pattern

**Stage 1: Staging Upload (immediate)**

When a user pastes or drops an image/video onto the canvas, the file is immediately uploaded to a staging folder in S3:
- Images: `temp/images/{uuid}-{filename}.png`
- Videos: `temp/videos/{uuid}-{filename}.{ext}`

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
┌──────────────────────┐
│ uploadImage()        │  Frontend calls /api/items/upload-image
│ → temp/images/{uuid} │  File stored in staging folder
└────────┬─────────────┘
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

---

# Backend API Endpoints

This section describes all available backend API endpoints, their arguments, functionality, and frontend usage.

## Base URL

All endpoints are prefixed with `/api` and proxied through the Vite dev server to `localhost:4000`.

---

## Health Check

### `GET /api/health`

**Description:** Simple health check endpoint to verify the server is running. Used by the frontend to display server connection status in the status bar.

**Arguments:** None

**Response:**
```json
{ "status": "ok" }
```

**Frontend Usage:** 1 call
- `frontend/src/components/StatusBar.tsx:27` - Polls every 5 seconds to show "Server OK" or "No Connection" indicator

---

## Proxy Endpoints

### `GET /api/proxy-image`

**Description:** Proxies image requests to avoid CORS issues when loading images from external URLs (especially S3). This is essential for canvas operations that need to read pixel data from images.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | The URL of the image to fetch |

**Response:** Binary image data with appropriate Content-Type header

**Frontend Usage:** 5 calls
- `frontend/src/utils/imageCrop.ts:38` - Loading S3 images for cropping
- `frontend/src/hooks/useClipboard.ts:195` - Copying images to clipboard
- `frontend/src/utils/htmlExport.ts:122` - Embedding images in HTML export
- `frontend/src/utils/sceneExport.ts:42` - Exporting scene images
- `frontend/src/components/canvas/menus/ImageContextMenu.tsx:120` - Download image action

---

### `GET /api/proxy-video`

**Description:** Proxies video requests to avoid CORS issues when loading videos from external URLs.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | The URL of the video to fetch |

**Response:** Binary video data with appropriate Content-Type header

**Frontend Usage:** 2 calls
- `frontend/src/utils/sceneExport.ts:61` - Exporting scene videos
- `frontend/src/components/canvas/menus/VideoContextMenu.tsx:149` - Download video action

---

## Items Endpoints (`/api/items`)

### `POST /api/items/save`

**Description:** Saves canvas state to S3. (Legacy endpoint)

**Request Body:**
```json
{
  "items": [ ... ] // Array of canvas items
}
```

**Response:**
```json
{ "success": true, "id": "<uuid>" }
```

**Frontend Usage:** 0 calls (legacy, replaced by scenes API)

---

### `GET /api/items/load/:id`

**Description:** Loads canvas state from S3. (Legacy endpoint)

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The canvas ID to load |

**Response:** JSON array of canvas items

**Frontend Usage:** 0 calls (legacy, replaced by scenes API)

---

### `GET /api/items/list`

**Description:** Lists all saved canvases. (Legacy endpoint)

**Arguments:** None

**Response:** Array of file keys from S3

**Frontend Usage:** 0 calls (legacy, replaced by scenes API)

---

### `POST /api/items/upload-image`

**Description:** Uploads an image (as base64 data URL) to S3 temporary storage. Returns the public S3 URL. Used for immediate upload on paste/drop to avoid storing large data URLs in memory.

**Request Body:**
```json
{
  "imageData": "data:image/png;base64,...", // Base64 image data URL
  "filename": "image.png" // Optional filename
}
```

**Response:**
```json
{ "success": true, "url": "https://bucket.s3.region.amazonaws.com/temp/images/..." }
```

**Frontend Usage:** 4 calls (via `uploadImage()` function)
- `frontend/src/App.tsx:816` - Uploading deleted item for recovery
- `frontend/src/hooks/useClipboard.ts:102` - Pasting images from clipboard
- `frontend/src/hooks/useClipboard.ts:275` - Pasting images from clipboard (alternate path)
- `frontend/src/components/InfiniteCanvas.tsx:327` - Dropping images onto canvas

---

### `POST /api/items/upload-video`

**Description:** Uploads a video (as base64 data URL) to S3 temporary storage. Returns the public S3 URL.

**Request Body:**
```json
{
  "videoData": "data:video/mp4;base64,...", // Base64 video data URL
  "filename": "video.mp4", // Original filename
  "contentType": "video/mp4" // MIME type
}
```

**Response:**
```json
{ "success": true, "url": "https://bucket.s3.region.amazonaws.com/temp/videos/..." }
```

**Frontend Usage:** 2 calls (via `uploadVideo()` function)
- `frontend/src/App.tsx:588` - Uploading video files
- `frontend/src/components/InfiniteCanvas.tsx:349` - Dropping videos onto canvas

---

### `POST /api/items/crop-image`

**Description:** Crops an image on the server using Sharp and saves the cropped version to S3. Supports both data URLs and S3 URLs as source.

**Request Body:**
```json
{
  "src": "https://... or data:image/...", // Source image URL or data URL
  "cropRect": {
    "x": 0,      // Left offset in pixels
    "y": 0,      // Top offset in pixels
    "width": 100,  // Crop width in pixels
    "height": 100  // Crop height in pixels
  }
}
```

**Response:**
```json
{ "success": true, "url": "https://bucket.s3.region.amazonaws.com/..." }
```

**Frontend Usage:** 1 call (via `cropImage()` function)
- `frontend/src/hooks/useCropMode.ts:121` - Applying image crop from crop panel

---

### `POST /api/items/crop-video`

**Description:** Processes a video on the server using FFmpeg. Supports cropping, speed changes, audio removal, and trimming. Operations can be combined. Uses two-pass encoding when both trim and speed change are requested to ensure accurate results.

**Request Body:**
```json
{
  "sceneId": "scene-uuid",  // Scene ID where the video belongs
  "videoId": "video-uuid",  // Video item ID (source key is constructed from these)
  "cropRect": {             // Optional crop rectangle
    "x": 0,
    "y": 0,
    "width": 640,
    "height": 480
  },
  "speed": 1.5,             // Optional playback speed multiplier
  "removeAudio": false,     // Optional - remove audio track
  "trim": {                 // Optional - trim video
    "start": 0,             // Start time in seconds
    "end": 10               // End time in seconds
  }
}
```

**Response:**
```json
{ "success": true, "url": "https://bucket.s3.region.amazonaws.com/.../video-id.crop.mp4" }
```

**Frontend Usage:** 1 call (via `cropVideo()` function)
- `frontend/src/hooks/useVideoCropMode.ts:171` - Applying video edits from video crop panel

---

## LLM Endpoints (`/api/llm`)

### `POST /api/llm/generate`

**Description:** Generates text using an LLM (Claude or Gemini). Accepts context items (text and images) along with a prompt.

**Request Body:**
```json
{
  "items": [                    // Optional context items
    { "type": "text", "text": "..." },
    { "type": "image", "src": "data:..." }
  ],
  "prompt": "Your instruction...", // Required prompt text
  "model": "claude-sonnet"         // Optional model (default: claude-sonnet)
}
```

**Supported Models:**
- `claude-haiku`, `claude-sonnet`, `claude-opus` (Anthropic)
- `gemini-flash`, `gemini-pro` (Google)

**Response:**
```json
{ "result": "Generated text response..." }
```

**Frontend Usage:** 2 calls (via `generateFromPrompt()` function)
- `frontend/src/App.tsx:897` - Running LLM prompts on canvas
- `frontend/src/api/llm.ts:156` - Generating HTML titles (internal use)

---

### `POST /api/llm/generate-image`

**Description:** Generates images using AI image generation models (currently Gemini Imagen).

**Request Body:**
```json
{
  "items": [...],              // Optional context items
  "prompt": "Image description...", // Required prompt text
  "model": "gemini-imagen"     // Optional model (default: gemini-imagen)
}
```

**Response:**
```json
{ "images": ["data:image/png;base64,...", ...] } // Array of data URLs
```

**Frontend Usage:** 1 call (via `generateImage()` function)
- `frontend/src/App.tsx:988` - Running image generation prompts

---

### `POST /api/llm/generate-html`

**Description:** Generates HTML code using an LLM. Takes spatial layout information about canvas items to help the LLM understand the visual context.

**Request Body:**
```json
{
  "spatialItems": [            // Array of positioned content blocks
    {
      "type": "text",
      "content": "...",
      "position": { "x": 0, "y": 0 },
      "size": { "width": 100, "height": 50 }
    },
    {
      "type": "image",
      "src": "...",
      "position": { "x": 100, "y": 0 },
      "size": { "width": 200, "height": 150 }
    }
  ],
  "userPrompt": "Create a webpage...", // Required instruction
  "model": "claude-sonnet"             // Optional model
}
```

**Response:**
```json
{ "html": "<!DOCTYPE html>..." }
```

**Frontend Usage:** 1 call (via `generateHtml()` function)
- `frontend/src/App.tsx:1101` - Running HTML generation prompts

---

## Scenes Endpoints (`/api/scenes`)

### `GET /api/scenes`

**Description:** Lists all scenes with metadata only (no items). Returns an array of scene summaries sorted for display.

**Arguments:** None

**Response:**
```json
[
  {
    "id": "scene-uuid",
    "name": "My Scene",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "modifiedAt": "2024-01-02T00:00:00.000Z",
    "itemCount": 5
  },
  ...
]
```

**Frontend Usage:** 3 calls (via `listScenes()` function)
- `frontend/src/App.tsx:135` - Loading scene list on app init
- `frontend/src/App.tsx:425` - Refreshing scene list after creating new scene
- `frontend/src/App.tsx:1232` - Refreshing scene list on demand

---

### `GET /api/scenes/:id`

**Description:** Loads a complete scene including all items with their full data. Images and videos are returned as S3 URLs, HTML content is loaded inline.

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Scene UUID |

**Response:**
```json
{
  "id": "scene-uuid",
  "name": "My Scene",
  "createdAt": "...",
  "modifiedAt": "...",
  "items": [
    { "type": "text", "id": "...", "x": 0, "y": 0, "text": "..." },
    { "type": "image", "id": "...", "src": "https://s3...", ... },
    { "type": "video", "id": "...", "src": "https://s3...", ... },
    { "type": "html", "id": "...", "html": "<!DOCTYPE html>...", ... }
  ]
}
```

**Frontend Usage:** 4 calls (via `loadScene()` function)
- `frontend/src/App.tsx:155` - Loading most recent scene on app init
- `frontend/src/App.tsx:1278` - Loading scene when switching scenes
- `frontend/src/App.tsx:1324` - Loading remote scene for conflict resolution
- `frontend/src/App.tsx:1414` - Loading remote scene for merging

---

### `GET /api/scenes/:id/raw`

**Description:** Returns the raw scene.json file without any transformation. Useful for debugging or exporting the raw data format.

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Scene UUID |

**Response:** Raw JSON string of the stored scene

**Frontend Usage:** 1 call (direct fetch)
- `frontend/src/App.tsx:1501` - Debug/export functionality

---

### `POST /api/scenes/:id`

**Description:** Saves a complete scene. Handles uploading images/videos from data URLs or external URLs to the scene's S3 folder. Cleans up temporary staging files after successful save.

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Scene UUID |

**Request Body:**
```json
{
  "name": "My Scene",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "modifiedAt": "2024-01-02T00:00:00.000Z",
  "items": [
    { "type": "text", "id": "...", "text": "...", ... },
    { "type": "image", "id": "...", "src": "data:... or https://...", ... },
    { "type": "video", "id": "...", "src": "data:... or https://...", ... },
    { "type": "html", "id": "...", "html": "<!DOCTYPE html>...", ... }
  ]
}
```

**Response:**
```json
{ "success": true, "id": "scene-uuid" }
```

**Frontend Usage:** 3 calls (via `saveScene()` function)
- `frontend/src/App.tsx:257` - Auto-save on changes
- `frontend/src/App.tsx:473` - Saving after creating new scene
- `frontend/src/App.tsx:1377` - Manual save

---

### `DELETE /api/scenes/:id`

**Description:** Deletes a scene and all its associated files (images, videos, HTML, history) from S3.

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Scene UUID |

**Response:**
```json
{ "success": true }
```

**Frontend Usage:** 1 call (via `deleteScene()` function)
- `frontend/src/App.tsx:499` - Deleting a scene

---

### `GET /api/scenes/:id/timestamp`

**Description:** Returns only the scene's modification timestamp. Used for lightweight conflict detection without loading the full scene.

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Scene UUID |

**Response:**
```json
{
  "id": "scene-uuid",
  "modifiedAt": "2024-01-02T00:00:00.000Z"
}
```

**Frontend Usage:** 2 calls (via `getSceneTimestamp()` function)
- `frontend/src/App.tsx:240` - Checking for conflicts before save
- `frontend/src/hooks/useRemoteChangeDetection.ts:43` - Polling for remote changes

---

### `GET /api/scenes/:id/content-url`

**Description:** Constructs and returns the S3 URL for a specific content item (image, video, or HTML) within a scene.

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Scene UUID |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contentId` | string | Yes | The item's UUID |
| `contentType` | string | Yes | One of: `video`, `image`, `html` |
| `extension` | string | No | File extension (default: mp4/png/html based on type) |
| `isEdit` | string | No | If "true", returns the `.crop` edited version |

**Response:**
```json
{ "url": "https://bucket.s3.region.amazonaws.com/version0/scene-id/item-id.mp4" }
```

**Frontend Usage:** 1 call (via `getContentUrl()` function)
- `frontend/src/components/canvas/menus/VideoContextMenu.tsx:110` - Getting original video URL

---

### `GET /api/scenes/:id/history`

**Description:** Loads the undo/redo history for a scene.

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Scene UUID |

**Response:**
```json
{
  "records": [...],      // Array of history records
  "currentIndex": 5      // Current position in history
}
```

**Frontend Usage:** 4 calls (via `loadHistory()` function)
- `frontend/src/App.tsx:158` - Loading history on app init
- `frontend/src/App.tsx:1281` - Loading history when switching scenes
- `frontend/src/App.tsx:1329` - Loading history for conflict resolution
- `frontend/src/App.tsx:1417` - Loading history for merging

---

### `POST /api/scenes/:id/history`

**Description:** Saves the undo/redo history for a scene.

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Scene UUID |

**Request Body:**
```json
{
  "records": [...],      // Array of history records
  "currentIndex": 5      // Current position in history
}
```

**Response:**
```json
{ "success": true }
```

**Frontend Usage:** 1 call (via `saveHistory()` function)
- `frontend/src/App.tsx:303` - Saving history with scene changes

---

## Summary Table

| Endpoint | Method | Frontend Calls |
|----------|--------|----------------|
| `/api/health` | GET | 1 |
| `/api/proxy-image` | GET | 5 |
| `/api/proxy-video` | GET | 2 |
| `/api/items/save` | POST | 0 (legacy) |
| `/api/items/load/:id` | GET | 0 (legacy) |
| `/api/items/list` | GET | 0 (legacy) |
| `/api/items/upload-image` | POST | 4 |
| `/api/items/upload-video` | POST | 2 |
| `/api/items/crop-image` | POST | 1 |
| `/api/items/crop-video` | POST | 1 |
| `/api/llm/generate` | POST | 2 |
| `/api/llm/generate-image` | POST | 1 |
| `/api/llm/generate-html` | POST | 1 |
| `/api/scenes` | GET | 3 |
| `/api/scenes/:id` | GET | 4 |
| `/api/scenes/:id` | POST | 3 |
| `/api/scenes/:id` | DELETE | 1 |
| `/api/scenes/:id/raw` | GET | 1 |
| `/api/scenes/:id/timestamp` | GET | 2 |
| `/api/scenes/:id/content-url` | GET | 1 |
| `/api/scenes/:id/history` | GET | 4 |
| `/api/scenes/:id/history` | POST | 1 |

**Total Active Endpoints:** 19 (excluding 3 legacy endpoints)
**Total Frontend API Calls:** 40
