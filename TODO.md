# TODO

## Inline Content Storage for Text and Prompt Objects

**Goal**: Store `text`, `label`, and `model` fields directly in `scene.json` for text blocks and prompt objects, instead of in separate files. HTML objects continue using separate `.html` files.

**Branch**: `feature/inline-text-content`

---

### Current Architecture

| Item Type | Current Storage | Change |
|-----------|-----------------|--------|
| Text | `{id}.txt` file, scene.json has `file` reference | Inline `text` in scene.json |
| Prompt | `{id}.prompt.json` with `{label, text, model}` | Inline all fields in scene.json |
| ImageGen Prompt | `{id}.imagegen.json` with `{label, text, model}` | Inline all fields in scene.json |
| HTMLGen Prompt | `{id}.htmlgen.json` with `{label, text, model}` | Inline all fields in scene.json |
| HTML | `{id}.html` file | **No change** - keep separate file |
| Image | `{id}.png` etc. | **No change** |
| Video | `{id}.{ext}` | **No change** |

---

### Implementation Plan

#### Phase 1: Create Feature Branch
- [x] Create branch `feature/inline-text-content` from master

#### Phase 2: Backend - Update Scene Types
- [x] Update `backend/src/types/` (if exists) or inline types in routes
- [x] Remove `file` field from text/prompt item schemas in scene.json
- [x] Add inline `text` field to text items
- [x] Add inline `text`, `label`, `model` fields to prompt/imagegen/htmlgen items

#### Phase 3: Backend - Update Save Logic (`backend/src/routes/scenes.ts`)
- [x] Modify `saveScene` to write text content directly to scene.json items
- [x] Modify `saveScene` to write prompt fields directly to scene.json items
- [x] Remove code that creates separate `.txt` files for text items
- [x] Remove code that creates separate `.prompt.json` files
- [x] Remove code that creates separate `.imagegen.json` files
- [x] Remove code that creates separate `.htmlgen.json` files
- [x] Keep `.html` file creation for HTML items unchanged

#### Phase 4: Backend - Update Load Logic (`backend/src/routes/scenes.ts`)
- [x] Modify `loadScene` to read text content directly from scene.json
- [x] Modify `loadScene` to read prompt fields directly from scene.json
- [x] Remove code that loads separate `.txt` files
- [x] Remove code that loads separate `.prompt.json` files
- [x] Remove code that loads separate `.imagegen.json` files
- [x] Remove code that loads separate `.htmlgen.json` files
- [x] Keep `.html` file loading for HTML items unchanged

#### Phase 5: Undo/Redo Verification
- [ ] Verify history.json already stores full object data (including text/label/model)
  - Current architecture: history records store complete object snapshots
  - This should continue to work without changes
- [ ] Test undo/redo for text edits
- [ ] Test undo/redo for prompt label/text/model changes
- [ ] Test undo/redo for add/delete operations

#### Phase 6: Frontend Verification
- [ ] Verify frontend types already have inline fields (they should)
- [ ] Test that frontend correctly sends/receives inline content
- [ ] No changes expected - frontend already works with inline data

#### Phase 7: Testing
- [ ] Create a new scene with text blocks - verify inline storage
- [ ] Create a new scene with prompt objects - verify inline storage
- [ ] Create a new scene with HTML objects - verify separate file storage
- [ ] Test scene save/load round-trip
- [ ] Test undo/redo for all affected item types
- [ ] Test mixed scenes (text + prompts + HTML + images)

#### Phase 8: Cleanup
- [ ] Delete any existing test scenes (not compatible with new format)
- [ ] Remove any dead code paths for old file-based storage

---

### Files to Modify

**Backend:**
- `backend/src/routes/scenes.ts` - Main save/load logic (DONE)

**Frontend (verify only, likely no changes):**
- `frontend/src/types/index.ts` - Type definitions

---

### Undo/Redo Notes

The current undo/redo system stores **full object snapshots** in history records:
- `add_object`: stores complete object with all fields
- `delete_object`: stores complete object for restoration
- `update_text`: stores `oldText`/`newText`
- `update_prompt`: stores old/new label and text
- `update_model`: stores old/new model

This approach is independent of how data is persisted to S3, so undo/redo should continue to work correctly after the refactor. The history is stored in a separate `history.json` file that already contains inline content.

---

### Rollback Plan

If issues arise:
1. Keep the feature branch unmerged
2. Delete test scenes created with new format
3. Return to master branch

---

### Do NOT Merge Until
- [ ] Manual testing of all item types
- [ ] Undo/redo tested for text and prompt changes
- [ ] User confirms feature is working as expected
