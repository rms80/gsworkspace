# Architecture

This document describes key architectural decisions and patterns in the gsworkspace codebase.

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

**Description:** Health check endpoint to verify the server is running and properly configured. Returns storage mode and any configuration warnings.

**Arguments:** None

**Response:**
```json
{
  "status": "ok",              // or "misconfigured"
  "storageMode": "local",      // "local" or "online"
  "configWarning": "..."       // Only present if status is "misconfigured"
}
```

**Frontend Usage:** 1 call
- `frontend/src/components/StatusBar.tsx` - Polls every 5 seconds to show server status

---

## Items Endpoints (`/api/items`)

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

**Frontend Usage:** Multiple calls (via `uploadImage()` function)
- `frontend/src/App.tsx` - Uploading deleted item for recovery
- `frontend/src/hooks/useClipboard.ts` - Pasting images from clipboard
- `frontend/src/components/InfiniteCanvas.tsx` - Dropping images onto canvas

---

### `POST /api/items/upload-video`

**Description:** Uploads a video file (multipart form data) to temporary storage. Returns the public URL. Uses multer middleware with 500MB file size limit.

**Request:** `multipart/form-data`
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `video` | File | Yes | Video file binary data |

**Response:**
```json
{ "success": true, "url": "https://..." }
```

**Frontend Usage:** 2 calls (via `uploadVideo()` function)
- `frontend/src/App.tsx` - Uploading video files
- `frontend/src/components/InfiniteCanvas.tsx` - Dropping videos onto canvas

---

### `POST /api/items/crop-image`

**Description:** Crops an image on the server using Sharp and saves the cropped version to storage. Uses scene and image IDs to locate the source image (tries common extensions: png, jpg, jpeg, gif, webp).

**Request Body:**
```json
{
  "sceneId": "scene-uuid",  // Scene ID where the image belongs
  "imageId": "image-uuid",  // Image item ID
  "cropRect": {
    "x": 0,       // Left offset in pixels
    "y": 0,       // Top offset in pixels
    "width": 100, // Crop width in pixels
    "height": 100 // Crop height in pixels
  }
}
```

**Response:**
```json
{ "success": true, "url": "https://..." }
```

**Frontend Usage:** 1 call (via `cropImage()` function)
- `frontend/src/hooks/useCropMode.ts` - Applying image crop from crop panel

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
- `frontend/src/hooks/useVideoCropMode.ts` - Applying video edits from video crop panel

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
- `frontend/src/App.tsx` - Running LLM prompts on canvas
- `frontend/src/api/llm.ts` - Generating HTML titles (internal use)

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
- `frontend/src/App.tsx` - Running image generation prompts

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
- `frontend/src/App.tsx` - Running HTML generation prompts

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

**Frontend Usage:** Multiple calls (via `listScenes()` function)
- `frontend/src/App.tsx` - Loading scene list on app init, refreshing after creating new scene, refreshing on demand

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

**Frontend Usage:** Multiple calls (via `loadScene()` function)
- `frontend/src/App.tsx` - Loading scenes on init, switching, and conflict resolution

---

### `GET /api/scenes/:id/raw`

**Description:** Returns the raw scene.json file without any transformation. Useful for debugging or exporting the raw data format.

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Scene UUID |

**Response:** Raw JSON string of the stored scene

**Frontend Usage:** 1 call (direct fetch)
- `frontend/src/App.tsx` - Debug/export functionality

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

**Frontend Usage:** Multiple calls (via `saveScene()` function)
- `frontend/src/App.tsx` - Auto-save on changes, saving after creating new scene, manual save

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
- `frontend/src/App.tsx` - Deleting a scene

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
- `frontend/src/App.tsx` - Checking for conflicts before save
- `frontend/src/hooks/useRemoteChangeDetection.ts` - Polling for remote changes

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
- `frontend/src/components/canvas/menus/VideoContextMenu.tsx` - Getting original video URL

---

### `GET /api/scenes/:id/content-data`

**Description:** Returns the actual binary content data for a scene item (image, video, or HTML). Automatically detects the file extension by trying common formats. This endpoint replaces the need for proxy endpoints by providing direct access to scene content.

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Scene UUID |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contentId` | string | Yes | The item's UUID |
| `contentType` | string | Yes | One of: `video`, `image`, `html` |
| `isEdit` | string | No | If "true", returns the `.crop` edited version |

**Supported Extensions:**
- Images: png, jpg, jpeg, gif, webp
- Videos: mp4, webm, mov, avi
- HTML: html

**Response:** Binary file data with appropriate Content-Type header

**Frontend Usage:** Multiple calls (via `getContentData()` function)
- `frontend/src/utils/sceneExport.ts` - Fetching images/videos for scene export
- `frontend/src/utils/htmlExport.ts` - Embedding images in HTML export
- `frontend/src/utils/imageCrop.ts` - Loading images for cropping
- `frontend/src/hooks/useClipboard.ts` - Copying images to clipboard
- `frontend/src/components/canvas/menus/ImageContextMenu.tsx` - Exporting images
- `frontend/src/components/canvas/menus/VideoContextMenu.tsx` - Exporting videos

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

**Frontend Usage:** Multiple calls (via `loadHistory()` function)
- `frontend/src/App.tsx` - Loading history on init, scene switching, and conflict resolution

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
- `frontend/src/App.tsx` - Saving history with scene changes

---

## Local Files Endpoints (`/api/local-files`)

### `GET /api/local-files/*`

**Description:** Serves files from local disk storage when running in local storage mode. The path after `/api/local-files/` maps directly to the storage directory structure. Includes path traversal protection.

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `*` | string | Yes | File path relative to storage root |

**Response:** Binary file data with appropriate Content-Type header. Media files (images/videos) include 1-year cache headers.

**Frontend Usage:** Indirect - URLs are generated by the backend and used in `<img>` and `<video>` tags when in local storage mode.

---

## Config Endpoints (`/api/config`)

### `GET /api/config`

**Description:** Returns the current server configuration including storage mode and paths.

**Arguments:** None

**Response:**
```json
{
  "storageMode": "local",           // "local" or "online"
  "localStoragePath": "/path/..."   // Only present when storageMode is "local"
}
```

**Frontend Usage:** Called to determine storage mode for UI display.

---

### `POST /api/config/storage-mode`

**Description:** Changes the storage mode at runtime. When switching to local mode, initializes the storage directory if needed.

**Request Body:**
```json
{
  "mode": "local"  // "local" or "online"
}
```

**Response:**
```json
{
  "success": true,
  "storageMode": "local",
  "localStoragePath": "/path/..."   // Only present when mode is "local"
}
```

**Frontend Usage:** Used by settings UI to switch between storage modes.

---

## Summary Table

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health and config status |
| `/api/items/upload-image` | POST | Upload image to staging |
| `/api/items/upload-video` | POST | Upload video to staging |
| `/api/items/crop-image` | POST | Crop an image server-side |
| `/api/items/crop-video` | POST | Process video (crop, speed, trim) |
| `/api/llm/generate` | POST | Generate text with LLM |
| `/api/llm/generate-image` | POST | Generate image with AI |
| `/api/llm/generate-html` | POST | Generate HTML with LLM |
| `/api/scenes` | GET | List all scenes |
| `/api/scenes/:id` | GET | Load a scene |
| `/api/scenes/:id` | POST | Save a scene |
| `/api/scenes/:id` | DELETE | Delete a scene |
| `/api/scenes/:id/raw` | GET | Get raw scene.json |
| `/api/scenes/:id/timestamp` | GET | Get scene modification time |
| `/api/scenes/:id/content-url` | GET | Get URL for scene content |
| `/api/scenes/:id/content-data` | GET | Get binary data for scene content |
| `/api/scenes/:id/history` | GET | Load scene history |
| `/api/scenes/:id/history` | POST | Save scene history |
| `/api/local-files/*` | GET | Serve local storage files |
| `/api/config` | GET | Get server configuration |
| `/api/config/storage-mode` | POST | Change storage mode |

**Total Endpoints:** 21
