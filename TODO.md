# TODO

## Scene Export/Import Feature

Enable exporting and importing entire scenes as zip files for backup, sharing, and portability.

**Design Decisions:**
- Export format: ZIP archive containing scene.json, history.json, and images folder
- Images stored as separate files (not embedded in JSON) for smaller file sizes
- Support both ZIP import and directory import
- UI: File menu with Export/Import options

---

### 1. Create File Menu UI

Add a File menu to the menu bar with export/import options.

**Files to modify:** `frontend/src/components/MenuBar.tsx`

**Substeps:**

1.1. **Add File menu dropdown**
   - Add "File" as first menu item
   - Dropdown with:
     - "Export Scene..."
     - "Import Scene from Zip..."
     - "Import Scene from Folder..."

1.2. **Wire up callbacks**
   - `onExportScene` - triggers export of active scene
   - `onImportSceneFromZip` - opens ZIP file picker directly
   - `onImportSceneFromFolder` - opens folder picker directly

---

### 2. Implement Scene Export

Export the active scene as a ZIP file.

**New files:** `frontend/src/utils/sceneExport.ts`

**Substeps:**

2.1. **Install jszip library**
   - Run `npm install jszip` in frontend directory
   - This handles ZIP creation in the browser

2.2. **Create export utility function**
   ```typescript
   async function exportScene(scene: Scene, history: SerializedHistory): Promise<Blob>
   ```

2.3. **Build ZIP structure**
   ```
   scene-name.zip/
   ├── scene.json        # Scene data with local image references
   ├── history.json      # Undo/redo history
   └── images/
       ├── {id}.png      # Original images
       └── {id}_crop.png # Cropped versions (if applicable)
   ```

2.4. **Process images for export**
   - For each ImageItem in the scene:
     - Fetch image from `src` (handle both data URLs and S3 URLs)
     - Save as `images/{item.id}.png`
     - If `cropSrc` exists, save as `images/{item.id}_crop.png`
     - Update scene.json to use relative paths: `"src": "images/{id}.png"`

2.5. **Handle S3/external URLs**
   - Use `/api/proxy-image` to fetch external images (CORS)
   - Convert to blob for inclusion in ZIP
   - In offline mode, only data URLs will work

2.6. **Trigger download**
   - Create blob URL from ZIP
   - Trigger browser download with filename `{scene.name}.zip`

---

### 3. Implement Scene Import

Import a scene from a ZIP file or directory.

**New files:** `frontend/src/utils/sceneImport.ts`

**Substeps:**

3.1. **Create hidden file inputs**
   - Hidden `<input type="file" accept=".zip">` for ZIP import
   - Hidden `<input type="file" webkitdirectory>` for folder import
   - Menu items trigger `.click()` on appropriate input

3.2. **Create import utility functions**
   ```typescript
   async function importSceneFromZip(file: File): Promise<{ scene: Scene, history: SerializedHistory }>
   async function importSceneFromDirectory(files: FileList): Promise<{ scene: Scene, history: SerializedHistory }>
   ```

3.3. **Parse ZIP file**
   - Use jszip to extract contents
   - Read scene.json and history.json
   - Load images from images/ folder

3.4. **Parse directory**
   - Find scene.json in file list
   - Find history.json in file list
   - Find images in images/ subfolder

3.5. **Process images for import**
   - Convert image files to data URLs (for offline mode)
   - Or upload to S3 and get URLs (for online mode)
   - Update scene.json image references with new sources

3.6. **Handle ID conflicts**
   - Generate new scene ID to avoid overwriting existing scenes
   - Optionally generate new item IDs

3.7. **Add imported scene**
   - Add to open scenes
   - Save to storage provider
   - Switch to the imported scene

---

### 4. Wire Up to App

Connect export/import to App.tsx state management.

**Files to modify:** `frontend/src/App.tsx`

**Substeps:**

4.1. **Add export handler**
   - Get active scene and its history
   - Call exportScene utility
   - Handle errors gracefully

4.2. **Add import handlers**
   - `handleImportFromZip` - triggered when ZIP file selected
   - `handleImportFromFolder` - triggered when folder selected
   - On successful import, add scene to state
   - Save to storage provider

4.3. **Pass handlers to MenuBar**
   - `onExportScene` prop
   - `onImportSceneFromZip` prop
   - `onImportSceneFromFolder` prop

---

### 5. Testing

**Substeps:**

5.1. **Test export**
   - Export scene with text items
   - Export scene with images (data URLs)
   - Export scene with images (S3 URLs) - online mode
   - Export scene with cropped images
   - Verify ZIP structure is correct

5.2. **Test import from ZIP**
   - Import previously exported scene
   - Verify all items restored correctly
   - Verify images load correctly
   - Verify history works

5.3. **Test import from directory**
   - Unzip an export and import via directory
   - Verify same results as ZIP import

5.4. **Test edge cases**
   - Import scene with same name as existing
   - Import in offline vs online mode
   - Large scenes with many images

---

## Implementation Notes

- **ZIP library:** jszip is well-maintained and works in browser
- **File structure:** Keep it simple and human-readable
- **Image format:** Export as PNG for quality, could add JPEG option later
- **Compatibility:** Exported ZIPs should be version-agnostic when possible
- **Offline mode:** Import should work in offline mode (images as data URLs)
