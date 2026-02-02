# TODO: Offline Mode AI Support

## Overview

Add support for AI features (LLM prompts, image generation, HTML generation) in offline mode by allowing users to configure their own API keys via a Settings dialog. API keys will be stored in the browser's localStorage.

Do all implementation in a feature branch. Don't merge or push unless I explicitly tell you to.

## Architecture

### New Components
- `SettingsDialog.tsx` - Modal dialog with tabbed interface
- `OfflineModeSettings.tsx` - Tab content for API key configuration

### Storage
- Extend `frontend/src/utils/settings.ts` to store API keys in localStorage
- Keys stored: `anthropicApiKey`, `googleApiKey`
- Keys should be stored separately from scene data for security (different localStorage key)

### API Layer Changes
- Create client-side API wrappers that call Claude/Gemini APIs directly from the browser
- Modify existing `frontend/src/api/llm.ts` to check offline mode and route accordingly:
  - Online mode: Use existing `/api/llm/*` backend endpoints
  - Offline mode: Use new client-side API calls with stored keys

---

## Implementation Tasks

### Phase 1: Settings Infrastructure

#### 1.1 Create API Key Storage Utilities
**File:** `frontend/src/utils/apiKeyStorage.ts`
- [x] Create `getAnthropicApiKey(): string | null`
- [x] Create `setAnthropicApiKey(key: string | null): void`
- [x] Create `getGoogleApiKey(): string | null`
- [x] Create `setGoogleApiKey(key: string | null): void`
- [x] Use a separate localStorage key (e.g., `workspaceapp-api-keys`) from scene settings
- [x] Consider basic obfuscation (not encryption - keys are client-side anyway)

#### 1.2 Create Settings Dialog Component
**File:** `frontend/src/components/SettingsDialog.tsx`
- [x] Create modal dialog component (similar style to existing dialogs)
- [x] Add tab navigation system (start with single "Offline Mode" tab, extensible for future)
- [x] Add open/close state management
- [x] Style consistently with existing app UI

#### 1.3 Create Offline Mode Settings Tab
**File:** `frontend/src/components/settings/OfflineModeSettingsTab.tsx`
- [x] Add password-type input field for Anthropic API key
- [x] Add password-type input field for Google API key
- [x] Add show/hide toggle for each key field
- [x] Add "Save" and "Clear" buttons for each key
- [x] Display validation status (key format check, not API validation)
- [x] Add help text explaining what each key is used for
- [x] Add warning about storing keys in browser

### Phase 2: Menu Integration

#### 2.1 Add Settings to Edit Menu
**File:** `frontend/src/components/MenuBar.tsx`
- [x] Add "Settings..." menu item to Edit menu
- [x] Add keyboard shortcut (Ctrl+, or Ctrl+Shift+S)
- [x] Wire up to open SettingsDialog

#### 2.2 Dialog State Management
**File:** `frontend/src/App.tsx`
- [x] Add `settingsDialogOpen` state
- [x] Add handlers for opening/closing settings dialog
- [x] Pass props down to MenuBar and render SettingsDialog

### Phase 3: Client-Side API Implementation

#### 3.1 Anthropic Client-Side API
**File:** `frontend/src/api/anthropicClient.ts`
- [x] Implement direct calls to Anthropic API using fetch
- [x] Handle Claude messages API format
- [x] Support text generation with context items
- [x] Support image inputs (base64)
- [x] Handle API errors gracefully
- [x] Note: May require CORS considerations - Anthropic API supports browser calls with API key

#### 3.2 Google/Gemini Client-Side API
**File:** `frontend/src/api/googleClient.ts`
- [x] Implement direct calls to Google Generative AI API
- [x] Support Gemini text generation
- [x] Support Imagen image generation
- [x] Handle API errors gracefully

#### 3.3 Modify LLM API Router
**File:** `frontend/src/api/llm.ts`
- [x] Import `isOfflineMode` from storage
- [x] Import client-side API modules
- [x] Modify `generateFromPrompt()`:
  - If offline + has Anthropic key: use anthropicClient
  - If offline + no key: throw descriptive error
  - If online: use existing backend endpoint
- [x] Modify `generateImage()`:
  - If offline + has Google key: use googleClient
  - If offline + no key: throw descriptive error
  - If online: use existing backend endpoint
- [x] Modify `generateHtml()`: same pattern as generateFromPrompt

### Phase 4: User Experience

#### 4.1 Error Handling & Feedback
- [x] Show clear error when attempting AI features without configured keys
- [x] Add toast/notification when API call fails due to invalid key
- [x] Guide user to Settings dialog when keys are missing

#### 4.2 Status Indication
**File:** `frontend/src/components/StatusBar.tsx`
- [x] Consider showing API key status in offline mode (e.g., "Offline - API keys configured")
- [x] Or show warning icon if in offline mode without keys

---

## Security Considerations

1. **API keys in localStorage**: Users should understand their keys are stored in the browser. Add appropriate warnings in the UI.

2. **No server-side exposure**: Keys never leave the browser in offline mode - calls go directly to API providers.

3. **Basic obfuscation only**: We can base64 encode or use simple obfuscation, but this is NOT security - just prevents casual inspection. True encryption would require a user password.

4. **Clear key option**: Users should be able to easily remove their keys.

---

## CORS Considerations

- **Anthropic API**: Supports direct browser calls with `anthropic-dangerous-direct-browser-access: true` header
- **Google AI API**: Generally supports browser calls with API key authentication

If CORS issues arise, alternatives:
1. Document that users need to use a browser extension to bypass CORS
2. Provide a simple proxy option they can self-host
3. Use a serverless function approach

---

## Testing Checklist

- [ ] Settings dialog opens from Edit menu
- [ ] API keys save to localStorage correctly
- [ ] API keys persist across page reloads
- [ ] API keys can be cleared
- [ ] LLM prompt works in offline mode with valid Anthropic key
- [ ] Image generation works in offline mode with valid Google key
- [ ] HTML generation works in offline mode with valid Anthropic key
- [ ] Appropriate errors shown when keys are missing
- [ ] Appropriate errors shown when keys are invalid
- [ ] Online mode continues to work unchanged (uses backend)

---

## Future Enhancements (Out of Scope)

- Additional settings tabs (appearance, keyboard shortcuts, etc.)
- Support for other LLM providers (OpenAI, etc.)
- API key validation on save (test call)
- Usage tracking/rate limiting awareness
- Import/export settings
