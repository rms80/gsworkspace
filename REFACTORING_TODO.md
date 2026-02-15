# App.tsx Refactoring Analysis

**File:** `frontend/src/App.tsx`
**Lines:** ~1600
**Status:** Many extractions complete; remaining items are lower priority

## Overview

App.tsx is the main application component. It has been significantly refactored from ~2735 lines down to ~1600 through extraction of hooks and services. The remaining items are lower priority.

---

## Completed Extractions

| # | Item | Extracted To | Status |
|---|------|-------------|--------|
| 2.1 | Item Factory Service | `services/itemFactory.ts` | Done |
| 2.2 | Item Positioning Service | `utils/itemPositioning.ts` | Done |
| 2.3 | Item Upload Handlers | `hooks/useItemUpload.ts` | Done |
| 3.1 | Coding Robot Manager | `hooks/useCodingRobotManager.ts` | Done |
| 4.1 | Auto-Save Manager | `hooks/useAutoSave.ts` | Done |
| 5.1 | Viewport Manager | `hooks/useViewportManager.ts` | Done |
| 6.1 | File Drop Handler | `hooks/useFileDrop.ts` | Done |
| 9.1 | Dialog Manager | `hooks/useDialogManager.ts` | Done |
| 10.1 | Prompt Execution Handlers | `hooks/usePromptExecution.ts` | Done |

---

## Remaining Extractions

### 1.1 Scene Management State
**Extract to:** `hooks/useSceneManager.ts`

**Includes:**
- `openScenes`, `setOpenScenes`
- `activeSceneId`, `setActiveSceneId`
- Scene operations: `addScene`, `selectScene`, `renameScene`, `closeScene`, `handleDeleteScene`
- Scene loading: `loadAllScenes`
- Save tracking: `lastSavedRef`, `persistedSceneIdsRef`

### 1.2 History Management State
**Extract to:** `hooks/useHistoryManager.ts`

**Includes:**
- `historyMap`, `setHistoryMap`
- `historyVersion`, `setHistoryVersion`
- `lastSavedHistoryRef`
- History operations: `pushChange`, `handleUndo`, `handleRedo`
- History persistence logic

### 1.4 Auth & Server State
**Extract to:** `hooks/useAuth.ts`

**Includes:**
- `authRequired`, `authenticated`
- `serverName`
- `handleLoginSuccess`, `handleLogout`
- Auth status checking logic

### 1.5 Storage & Offline State
**Extract to:** `hooks/useStorageMode.ts`

**Includes:**
- `isOffline`, `storageMode`
- `handleSetOfflineMode`, `handleStorageModeChange`, `handleStorageModeSync`
- Storage mode persistence

---

## Current Metrics

- **Lines of Code:** ~1600
- **useState Hooks:** 17
- **useCallback Functions:** 43
- **useEffect Hooks:** 8
- **useRef Hooks:** 7

---

## Notes

- This refactoring should be done incrementally, not all at once
- Some state will remain in App.tsx as it coordinates top-level concerns
- The remaining extractions (scene, history, auth, storage) are tightly coupled and may be harder to separate cleanly
