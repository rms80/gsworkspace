# Architecture

This document describes key architectural decisions and patterns in the gsworkspace codebase.

## Media Storage (Images & Videos)

### Overview

Media files (images and videos) are uploaded directly to the scene folder on drop/paste. The frontend provides the `sceneId` and `itemId` with each upload so the file is stored in its final location immediately.

### Direct-to-Scene Upload

When a user pastes or drops an image/video onto the canvas, the file is immediately uploaded to the scene folder:
- Images: `{workspace}/{sceneId}/{itemId}.{ext}`
- Videos: `{workspace}/{sceneId}/{itemId}.{ext}`

This happens via the `/api/w/:workspace/items/upload-image` and `/api/w/:workspace/items/upload-video` endpoints.

**Why immediate upload to scene folder?**
- Avoids keeping large base64 data URLs in browser memory
- Keeps undo/redo history lightweight (stores URLs instead of raw data)
- No staging cleanup needed on save — files are already in the right place

**Video transcoding**: Non-browser-native video formats (e.g., `.mov`, `.avi`) are automatically transcoded to MP4 (H.264/AAC) on upload.

### Flow Diagram

```
User drops image
       │
       ▼
┌─────────────────────────────────────────┐
│ uploadImage(sceneId, itemId)            │
│ POST /api/w/:workspace/items/upload-image│
│ → {workspace}/{sceneId}/{itemId}.png    │
└────────┬────────────────────────────────┘
         │
         ▼
   Canvas shows image
   (using storage URL)
         │
         ▼
   User saves scene
         │
         ▼
┌──────────────────────────────────────────┐
│ POST /api/w/:workspace/scenes/{id}       │
│                                          │
│ Image already in scene folder — no copy  │
│ Just saves scene.json with item metadata │
└──────────────────────────────────────────┘
```

### Special Cases

**Already in scene folder**: If an image/video URL already points to the current scene folder, no copy is made (avoids redundant work on re-saves).

**Data URLs**: If a data URL reaches the save logic, it's decoded and saved directly to the scene folder.

### Related Files

- `frontend/src/api/images.ts` - `uploadImage()` with sceneId/itemId
- `frontend/src/api/videos.ts` - `uploadVideo()` with sceneId/itemId
- `backend/src/routes/items.ts` - `/upload-image`, `/upload-video` endpoints
- `backend/src/routes/scenes.ts` - Scene save logic

---

## Scene Storage Format

### Overview

Scenes are organized by workspace, with each scene in its own folder under `{workspace}/{sceneId}/`.

### Folder Structure

```
{workspace}/
  ├── workspace.json          # Workspace metadata (name, hidden, pinnedSceneIds)
  └── {sceneId}/
      ├── scene.json          # Scene metadata and item definitions
      ├── history.json        # Undo/redo history
      ├── {itemId}.png        # Image files
      ├── {itemId}.crop.png   # Cropped image files
      ├── {itemId}.mp4        # Video files
      ├── {itemId}.crop.mp4   # Processed video files
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
  "version": "1",
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

The `version` field is stamped by the server on every save (ignoring any client-provided value). Old scenes without a `version` field still load fine since the field is optional.

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

All endpoints are prefixed with `/api` and proxied through the Vite dev server to `localhost:4000`. Workspace-scoped endpoints use `/api/w/:workspace/` prefix. The frontend derives the active workspace from the first segment of the URL path (defaulting to `"default"`).

---

## Auth Endpoints (`/api/auth`)

These endpoints are public (not behind auth middleware). Auth is optional — if `AUTH_PASSWORD` is not set in the backend `.env`, all requests pass through unauthenticated.

### `GET /api/auth/status`

**Description:** Returns whether authentication is required and whether the current session is authenticated.

**Response:**
```json
{
  "authRequired": true,        // false if AUTH_PASSWORD is not set
  "authenticated": false,      // true if session is authenticated or auth is not required
  "serverName": "gsworkspace"  // from SERVER_NAME env var
}
```

---

### `POST /api/auth/login`

**Description:** Authenticates with the server password. Sets a session cookie.

**Request Body:**
```json
{ "password": "..." }
```

**Response:**
```json
{ "success": true }
```

**Error:** `401` if password is invalid.

---

### `POST /api/auth/logout`

**Description:** Clears the session cookie.

**Response:**
```json
{ "success": true }
```

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

## Workspaces Endpoints (`/api/workspaces`)

### `GET /api/workspaces`

**Description:** Lists all non-hidden workspaces. Discovers workspaces from `workspace.json` files and also detects legacy workspace folders that have scene content but no `workspace.json`.

**Response:**
```json
[
  { "name": "default", "createdAt": "2025-01-01T00:00:00.000Z" },
  { "name": "my-project", "createdAt": "2025-06-15T10:00:00.000Z" }
]
```

---

### `GET /api/workspaces/:name`

**Description:** Checks if a workspace exists and returns its metadata (hidden flag, pinned scene IDs).

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Workspace name (1-64 alphanumeric, hyphen, or underscore) |

**Response:**
```json
{
  "exists": true,
  "hidden": false,
  "pinnedSceneIds": ["scene-uuid-1", "scene-uuid-2"]
}
```

---

### `POST /api/workspaces`

**Description:** Creates a new workspace. Writes a `workspace.json` to the workspace folder.

**Request Body:**
```json
{
  "name": "my-workspace",  // Required, must match /^[a-zA-Z0-9_-]{1,64}$/
  "hidden": false           // Optional, default false
}
```

**Response:**
```json
{
  "success": true,
  "workspace": { "name": "my-workspace", "hidden": false, "createdAt": "..." }
}
```

**Error:** `409` if workspace already exists, `400` if name is invalid.

---

### `PUT /api/workspaces/:name/pinned-scenes`

**Description:** Updates the list of pinned scene IDs for a workspace. Creates a minimal `workspace.json` if one doesn't exist yet (for legacy workspaces).

**Request Body:**
```json
{ "sceneIds": ["scene-uuid-1", "scene-uuid-2"] }
```

**Response:**
```json
{ "success": true }
```

---

## Items Endpoints (`/api/w/:workspace/items`)

### `POST /api/w/:workspace/items/upload-image`

**Description:** Uploads an image (as base64 data URL) directly to the scene folder. Returns the public URL. The `sceneId` and `itemId` determine the storage path.

**Request Body:**
```json
{
  "imageData": "data:image/png;base64,...", // Base64 image data URL
  "sceneId": "scene-uuid",                 // Required scene ID
  "itemId": "item-uuid",                   // Required item ID
  "filename": "image.png"                  // Optional (used for extension detection)
}
```

**Response:**
```json
{ "success": true, "url": "https://..." }
```

**Frontend Usage:** Multiple calls (via `uploadImage()` function)
- `frontend/src/App.tsx` - Uploading images on paste/drop
- `frontend/src/hooks/useClipboard.ts` - Pasting images from clipboard
- `frontend/src/components/InfiniteCanvas.tsx` - Dropping images onto canvas

---

### `POST /api/w/:workspace/items/upload-video`

**Description:** Uploads a video file (multipart form data) directly to the scene folder. Non-browser-native formats (e.g., `.mov`, `.avi`) are automatically transcoded to MP4. Uses multer middleware with 500MB file size limit.

**Request:** `multipart/form-data`
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `video` | File | Yes | Video file binary data |
| `sceneId` | string | Yes | Scene UUID |
| `itemId` | string | Yes | Item UUID |

**Response:**
```json
{ "success": true, "url": "https://...", "transcoded": true }
```

The `transcoded` field is only present (and `true`) when the video was converted to MP4.

**Frontend Usage:** 2 calls (via `uploadVideo()` function)
- `frontend/src/App.tsx` - Uploading video files
- `frontend/src/components/InfiniteCanvas.tsx` - Dropping videos onto canvas

---

### `POST /api/w/:workspace/items/crop-image`

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

### `POST /api/w/:workspace/items/crop-video`

**Description:** Processes a video on the server using FFmpeg. Supports cropping, speed changes, audio removal, and trimming. Operations can be combined. Uses two-pass encoding when both trim and speed change are requested to ensure accurate results.

**Request Body:**
```json
{
  "sceneId": "scene-uuid",  // Scene ID where the video belongs
  "videoId": "video-uuid",  // Video item ID
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
  },
  "extension": "mp4"        // Optional source file extension (default: mp4)
}
```

**Response:**
```json
{ "success": true }
```

**Frontend Usage:** 1 call (via `cropVideo()` function)
- `frontend/src/hooks/useVideoCropMode.ts` - Applying video edits from video crop panel

---

## LLM Endpoints (`/api/w/:workspace/llm`)

### `POST /api/w/:workspace/llm/generate`

**Description:** Generates text using an LLM (Claude or Gemini). Accepts context items (text and image references) along with a prompt. Image items are resolved server-side from storage using workspace/sceneId/itemId.

**Request Body:**
```json
{
  "items": [                    // Optional context items
    { "type": "text", "text": "..." },
    { "type": "image", "id": "item-uuid", "sceneId": "scene-uuid", "useEdited": false }
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

### `POST /api/w/:workspace/llm/generate-image`

**Description:** Generates images using AI image generation models (currently Gemini Imagen).

**Request Body:**
```json
{
  "items": [...],              // Optional context items (same format as /generate)
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

### `POST /api/w/:workspace/llm/generate-html`

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

## Scenes Endpoints (`/api/w/:workspace/scenes`)

### `GET /api/w/:workspace/scenes`

**Description:** Lists all scenes in the workspace with metadata only (no items). Returns an array of scene summaries.

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

### `GET /api/w/:workspace/scenes/:id`

**Description:** Loads a complete scene including all items with their full data. Images and videos are returned as storage URLs, HTML content is loaded inline. Includes the `version` field if present.

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
  "version": "1",
  "items": [
    { "type": "text", "id": "...", "x": 0, "y": 0, "text": "..." },
    { "type": "image", "id": "...", "src": "https://...", ... },
    { "type": "video", "id": "...", "src": "https://...", ... },
    { "type": "html", "id": "...", "html": "<!DOCTYPE html>...", ... }
  ]
}
```

**Frontend Usage:** Multiple calls (via `loadScene()` function)
- `frontend/src/App.tsx` - Loading scenes on init, switching, and conflict resolution

---

### `GET /api/w/:workspace/scenes/:id/raw`

**Description:** Returns the raw scene.json file without any transformation. Useful for debugging or exporting the raw data format.

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Scene UUID |

**Response:** Raw JSON string of the stored scene

**Frontend Usage:** 1 call (direct fetch)
- `frontend/src/App.tsx` - Debug/export functionality

---

### `POST /api/w/:workspace/scenes/:id`

**Description:** Saves a complete scene. Handles any remaining data URLs or external URLs by saving them to the scene folder. Stamps a `version` field on the stored scene (overriding any client value).

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

### `DELETE /api/w/:workspace/scenes/:id`

**Description:** Deletes a scene and all its associated files (images, videos, HTML, history) from storage.

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

### `GET /api/w/:workspace/scenes/:id/timestamp`

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

### `GET /api/w/:workspace/scenes/:id/content-url`

**Description:** Constructs and returns the storage URL for a specific content item (image, video, or HTML) within a scene.

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
{ "url": "https://.../{workspace}/scene-id/item-id.mp4" }
```

**Frontend Usage:** 1 call (via `getContentUrl()` function)
- `frontend/src/components/canvas/menus/VideoContextMenu.tsx` - Getting original video URL

---

### `GET /api/w/:workspace/scenes/:id/content-data`

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

### `GET /api/w/:workspace/scenes/:id/history`

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

### `POST /api/w/:workspace/scenes/:id/history`

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
| `/api/auth/status` | GET | Auth status and server name |
| `/api/auth/login` | POST | Authenticate with password |
| `/api/auth/logout` | POST | Clear session |
| `/api/health` | GET | Server health and config status |
| `/api/workspaces` | GET | List all workspaces |
| `/api/workspaces/:name` | GET | Check workspace existence and metadata |
| `/api/workspaces` | POST | Create a workspace |
| `/api/workspaces/:name/pinned-scenes` | PUT | Update pinned scene IDs |
| `/api/w/:workspace/items/upload-image` | POST | Upload image to scene folder |
| `/api/w/:workspace/items/upload-video` | POST | Upload video to scene folder (auto-transcode) |
| `/api/w/:workspace/items/crop-image` | POST | Crop an image server-side |
| `/api/w/:workspace/items/crop-video` | POST | Process video (crop, speed, trim) |
| `/api/w/:workspace/llm/generate` | POST | Generate text with LLM |
| `/api/w/:workspace/llm/generate-image` | POST | Generate image with AI |
| `/api/w/:workspace/llm/generate-html` | POST | Generate HTML with LLM |
| `/api/w/:workspace/scenes` | GET | List all scenes in workspace |
| `/api/w/:workspace/scenes/:id` | GET | Load a scene |
| `/api/w/:workspace/scenes/:id` | POST | Save a scene |
| `/api/w/:workspace/scenes/:id` | DELETE | Delete a scene |
| `/api/w/:workspace/scenes/:id/raw` | GET | Get raw scene.json |
| `/api/w/:workspace/scenes/:id/timestamp` | GET | Get scene modification time |
| `/api/w/:workspace/scenes/:id/content-url` | GET | Get URL for scene content |
| `/api/w/:workspace/scenes/:id/content-data` | GET | Get binary data for scene content |
| `/api/w/:workspace/scenes/:id/history` | GET | Load scene history |
| `/api/w/:workspace/scenes/:id/history` | POST | Save scene history |
| `/api/local-files/*` | GET | Serve local storage files |
| `/api/config` | GET | Get server configuration |
| `/api/config/storage-mode` | POST | Change storage mode |

**Total Endpoints:** 28
