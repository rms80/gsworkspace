# App.tsx Refactoring Analysis

**File:** `frontend/src/App.tsx`
**Lines:** 2735
**Status:** Monolithic component with significant refactoring opportunities

## Overview

App.tsx is the main application component that handles all state management, business logic, and orchestration. It has grown to nearly 3000 lines and contains multiple concerns that could be separated into focused modules.

---

## 1. State Management (HIGH PRIORITY)

### Current Issues
- 27+ useState hooks in a single component
- State spread across local state, refs, and derived state
- Complex interdependencies between state updates
- Difficult to test and reason about

### Recommended Refactoring

#### 1.1 Scene Management State
**Extract to:** `hooks/useSceneManager.ts`

**Includes:**
- `openScenes`, `setOpenScenes`
- `activeSceneId`, `setActiveSceneId`
- Scene operations: `addScene`, `selectScene`, `renameScene`, `closeScene`, `handleDeleteScene`
- Scene loading: `loadAllScenes`
- Save tracking: `lastSavedRef`, `persistedSceneIdsRef`

**Benefits:**
- Isolates all scene lifecycle management
- Easier to test scene operations independently
- Cleaner API for scene manipulation

#### 1.2 History Management State
**Extract to:** `hooks/useHistoryManager.ts`

**Includes:**
- `historyMap`, `setHistoryMap`
- `historyVersion`, `setHistoryVersion`
- `lastSavedHistoryRef`
- History operations: `pushChange`, `handleUndo`, `handleRedo`
- History persistence logic

**Benefits:**
- Separates undo/redo logic from main component
- Makes history system reusable
- Easier to test history operations

#### 1.3 Selection State
**Extract to:** `hooks/useSelectionManager.ts`

**Includes:**
- `selectionMap`, `setSelectionMap`
- `selectedIds` derivation
- Selection operations
- Multi-selection logic

**Benefits:**
- Isolates selection concerns
- Can be reused in other contexts
- Easier to reason about selection state

#### 1.4 Auth & Server State
**Extract to:** `hooks/useAuth.ts`

**Includes:**
- `authRequired`, `authenticated`
- `serverName`
- `handleLoginSuccess`, `handleLogout`
- Auth status checking logic

**Benefits:**
- Separates authentication concerns
- Can be reused across the app
- Easier to mock for testing

#### 1.5 Storage & Offline State
**Extract to:** `hooks/useStorageMode.ts`

**Includes:**
- `isOffline`, `storageMode`
- `handleSetOfflineMode`, `handleStorageModeChange`, `handleStorageModeSync`
- Storage mode persistence

**Benefits:**
- Centralizes storage mode logic
- Makes online/offline switching more robust
- Easier to test mode transitions

#### 1.6 LLM Execution State
**Extract to:** `hooks/useLLMExecution.ts` (or enhance existing `usePromptExecution`)

**Includes:**
- `runningPromptIds`, `runningImageGenPromptIds`, `runningHtmlGenPromptIds`
- `runningCodingRobotIds`, `reconnectingCodingRobotIds`
- `codingRobotActivity`
- Prompt execution handlers
- Activity management logic

**Benefits:**
- Separates LLM execution state
- Can handle all prompt types uniformly
- Easier to add new prompt types

---

## 2. Item Creation Logic (HIGH PRIORITY)

### Current Issues
- 10+ `addXxxItem` functions (addTextItem, addImageItem, addVideoItem, addPromptItem, etc.)
- Each function has similar structure but subtle differences
- Repetitive positioning logic (viewport center + random offset)
- Mixed concerns (item creation, upload, positioning, history)

### Recommended Refactoring

#### 2.1 Item Factory Service
**Extract to:** `services/itemFactory.ts`

**Purpose:** Centralize item creation logic with consistent patterns

```typescript
export const createTextItem = (x: number, y: number, text?: string): TextItem => { ... }
export const createImageItem = (id: string, src: string, dimensions: Dimensions): ImageItem => { ... }
export const createPromptItem = (x: number, y: number, type: PromptType): PromptItem => { ... }
// etc.
```

**Benefits:**
- Single source of truth for item defaults
- Easier to maintain item structure
- Can be unit tested independently

#### 2.2 Item Positioning Service
**Extract to:** `utils/itemPositioning.ts`

**Purpose:** Handle all positioning logic (viewport center, random offset, snap to grid)

```typescript
export const getItemPosition = (
  canvasRef: CanvasHandle | null,
  x?: number,
  y?: number,
  width?: number,
  height?: number
): { x: number; y: number }
```

**Benefits:**
- Consistent positioning across all item types
- Easier to change positioning strategy
- Reduces duplication

#### 2.3 Item Upload Handlers
**Extract to:** `hooks/useItemUpload.ts`

**Includes:**
- `handleAddImage`, `handleAddVideo`, `handleAddPdf`, `handleAddTextFile`
- File reading, dimension extraction, upload coordination
- Placeholder management for videos

**Benefits:**
- Separates upload concerns from item creation
- Easier to test upload flows
- Can handle upload progress/errors uniformly

---

## 3. Coding Robot Activity Logic (MEDIUM PRIORITY)

### Current Issues
- Complex SSE reconnection logic embedded in useEffect (lines 158-348)
- Activity restoration from IndexedDB
- Polling reconnection after HMR
- Mixed with component state

### Recommended Refactoring

#### 3.1 Coding Robot Manager
**Extract to:** `hooks/useCodingRobotManager.ts`

**Includes:**
- Activity restoration from IndexedDB
- SSE reconnection logic
- Polling logic
- Activity state management
- Chat history management

**Benefits:**
- Isolates complex reconnection logic
- Easier to test SSE/polling flows
- Can be reused if needed
- Reduces main component complexity

---

## 4. Auto-Save Logic (MEDIUM PRIORITY)

### Current Issues
- Two separate useEffect hooks for scene and history auto-save (lines 683-783)
- Complex debouncing logic
- Conflict detection mixed with save logic
- State tracking spread across multiple refs

### Recommended Refactoring

#### 4.1 Auto-Save Manager
**Extract to:** `hooks/useAutoSave.ts`

**Includes:**
- Scene auto-save with debouncing
- History auto-save with debouncing
- Conflict detection
- Save status management
- Timestamp tracking

**Benefits:**
- Centralized auto-save logic
- Easier to test save flows
- Can adjust debounce timing uniformly
- Better error handling

---

## 5. Viewport Management (MEDIUM PRIORITY)

### Current Issues
- Viewport state spread across refs and localStorage
- Save/restore logic in multiple useEffects
- Mixed with scene switching logic

### Recommended Refactoring

#### 5.1 Viewport Manager
**Extract to:** `hooks/useViewportManager.ts`

**Includes:**
- `viewportMapRef` management
- Viewport save/restore on scene switch
- Periodic viewport persistence
- beforeunload handling

**Benefits:**
- Separates viewport concerns
- Easier to test viewport persistence
- Can be reused if multiple canvas instances needed

---

## 6. File Drop Handling (LOW PRIORITY)

### Current Issues
- File drop logic embedded in component (lines 1700-2000+)
- Handles multiple file types (images, videos, PDFs, text files)
- Complex MIME type detection

### Recommended Refactoring

#### 6.1 File Drop Handler
**Extract to:** `hooks/useFileDrop.ts`

**Includes:**
- File type detection
- Multiple file handling
- Drop position calculation
- Integration with upload handlers

**Benefits:**
- Separates file handling from component
- Easier to test file drop flows
- Can add new file types easily

---

## 7. Workspace Management (LOW PRIORITY)

### Current Issues
- Workspace switching logic
- Last workspace persistence
- Hidden workspace detection
- Mixed with initialization logic

### Recommended Refactoring

#### 7.1 Workspace Manager
**Extract to:** `hooks/useWorkspaceManager.ts`

**Includes:**
- Workspace detection and validation
- Last workspace tracking
- Hidden workspace handling
- Workspace switching

**Benefits:**
- Cleaner workspace logic
- Easier to test workspace features
- Better separation of concerns

---

## 8. Conflict Detection & Resolution (LOW PRIORITY)

### Current Issues
- Conflict detection mixed with save logic
- Remote timestamp checking
- Conflict dialog management

### Recommended Refactoring

#### 8.1 Conflict Manager
**Extract to:** `hooks/useConflictManager.ts` (or enhance existing `useRemoteChangeDetection`)

**Includes:**
- Remote change detection
- Conflict state management
- Conflict resolution strategies

**Benefits:**
- Isolates conflict handling
- Can implement different resolution strategies
- Easier to test conflict scenarios

---

## 9. Dialog State Management (LOW PRIORITY)

### Current Issues
- 7+ dialog open/close state variables
- Scattered dialog logic

### Recommended Refactoring

#### 9.1 Dialog Manager
**Extract to:** `hooks/useDialogManager.ts`

**Includes:**
- `openSceneDialogOpen`, `settingsDialogOpen`, etc.
- Dialog opening/closing logic
- Available scenes fetching

**Benefits:**
- Centralized dialog state
- Easier to manage multiple dialogs
- Can add dialog queueing if needed

---

## 10. Prompt Execution Handlers (MEDIUM PRIORITY)

### Current Issues
- Multiple prompt execution handlers (text generation, image generation, HTML generation, Claude Code)
- Similar patterns with different details
- Mixed with activity management

### Recommended Refactoring

#### 10.1 Enhance Existing Hook
**Enhance:** `hooks/usePromptExecution.ts`

**Move from App.tsx:**
- `handleRunPrompt`, `handleRunImageGenPrompt`, `handleRunHtmlGenPrompt`
- `handleSendCodingRobotMessage`
- Result handling and item updates

**Benefits:**
- Centralizes all prompt execution
- Consistent error handling
- Easier to add new prompt types

---

## Implementation Priority

### Phase 1 (Immediate Impact)
1. **State Management** - Extract scene, history, and selection managers
2. **Item Creation** - Extract item factory and positioning logic
3. **Auto-Save** - Extract auto-save manager

### Phase 2 (Quality Improvement)
4. **Coding Robot** - Extract activity management
5. **Item Upload** - Extract upload handlers
6. **Prompt Execution** - Enhance existing prompt execution hook

### Phase 3 (Code Cleanup)
7. **Viewport Management** - Extract viewport manager
8. **File Drop** - Extract file drop handler
9. **Dialogs** - Extract dialog manager

### Phase 4 (Polish)
10. **Workspace** - Extract workspace manager
11. **Conflict Resolution** - Enhance conflict detection

---

## Metrics

### Current State
- **Lines of Code:** 2735
- **useState Hooks:** 27
- **useCallback Functions:** 40+
- **useEffect Hooks:** 12+
- **useRef Hooks:** 10+

### Target State (After Refactoring)
- **Main Component Lines:** ~500-800
- **Custom Hooks:** 10-15 focused hooks
- **Service Modules:** 3-5 utility modules
- **Test Coverage:** 80%+ for extracted modules

---

## Testing Strategy

After refactoring, each extracted module should have:
1. **Unit tests** for business logic
2. **Integration tests** for hooks that interact
3. **Mock scenarios** for error cases
4. **Performance tests** for heavy operations (auto-save, uploads)

---

## Notes

- This refactoring should be done incrementally, not all at once
- Each extraction should be a separate PR with tests
- Maintain backward compatibility during transition
- Consider using a state management library (Zustand, Jotai) if complexity continues to grow
- Some state will remain in App.tsx as it coordinates top-level concerns

---

## Additional Considerations

### Type Safety
- Extract shared types to `types/` directory
- Create discriminated unions for item types
- Use strict TypeScript settings

### Performance
- Memoize expensive computations
- Use React.memo for child components
- Consider virtualization for large item lists

### Accessibility
- Add ARIA labels after refactoring
- Ensure keyboard navigation works
- Test with screen readers

### Documentation
- Add JSDoc comments to all exported functions
- Create architecture documentation
- Document state flow diagrams
