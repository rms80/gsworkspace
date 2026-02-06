# Security Audit TODO

Security audit performed on 2026-02-06. Updated 2026-02-06 for workspace API and auth changes.
Issues organized by severity with remediation plans.

---

## Summary

| Severity | Backend | Frontend | Total |
|----------|---------|----------|-------|
| High | 2 | 0 | 2 |
| Medium | 3 | 3 | 6 |
| Low | 4 | 0 | 4 |
| **Total** | **9** | **3** | **12** |

---

## Previously Fixed

- **SSRF in Image Proxy** - `/api/proxy-image` endpoint removed entirely
- **Iframe Script Execution** - `allow-scripts` removed from iframe sandbox
- **Path Traversal in S3 Refs** - URL validation via `validateItemSrcUrl()` in scenes.ts
- **Unsafe Filename in S3 Key** - Uploads now use `itemId.ext` instead of raw filenames
- **Overly Permissive CORS** - Restricted to localhost (dev) and `ALLOWED_ORIGINS` env var (production)
- **Missing Scene ID Validation** - `router.param` middleware validates UUIDs on all scene routes
- **No HTML Sanitization** - DOMPurify sanitizes LLM-generated HTML before rendering
- **Unescaped RegExp** - Replaced with safe `split().join()` in spatialJson.ts
- **Unsafe JSON Parsing** - All `JSON.parse()` calls wrapped in try-catch
- **Missing Security Headers** - Helmet middleware added with sensible defaults
- **Vulnerable Vite Version** - Updated from Vite 5.x to 6.x
- **SSRF via LLM Services** - Frontend now sends image IDs; backend resolves from storage instead of fetching URLs
- **No Canvas Item Limit** - MAX_ITEMS_PER_SCENE (1000) enforced in updateActiveSceneItems
- **No Scene Name Length Validation** - Scene names truncated to 255 characters in renameScene
- **Silent Image Resolve Failures** - Unresolvable images now throw, surfacing error to client
- **Missing URL Validation on Frontend API Calls** - UUID validation via `validateUuid()` on all API call sites
- **Missing Rate Limiting** - express-rate-limit: 1000/15min general, 20/15min LLM, 60/15min uploads, 25/15min auth login, 10/15min workspace creation
- **Missing Authentication** - Password + cookie-session auth via `AUTH_PASSWORD` env var; all `/api/` routes protected when enabled
- **Workspace Isolation** - Verified: workspace param always comes from `req.params.workspace` (validated URL), never from request body. Client-supplied `sceneId` only creates subfolders within the URL workspace. Storage layer (`diskStorage.validatePath`) also prevents path traversal in local mode. No cross-workspace access possible.
- **Workspace Name Validation** - Regex `/^[a-zA-Z0-9_-]{1,64}$/` on both `app.param('workspace')` and workspace router. Blocks path traversal characters, unicode, and overly long names.

---

## HIGH

### ~~1. [Backend] Missing Authentication/Authorization~~ FIXED
Password-based auth with `cookie-session`. When `AUTH_PASSWORD` is set, all `/api/` routes require authentication via session cookie. Auth endpoints: `GET /api/auth/status`, `POST /api/auth/login`, `POST /api/auth/logout`. Frontend shows login screen when auth is required.

---

### ~~2. [Backend] No Rate Limiting on Auth Login~~ FIXED
Auth login rate-limited to 25 attempts per 15 minutes per IP via `authLimiter` (configurable with `RATE_LIMIT_AUTH` env var).

---

### 3. [Backend] Large Payload DoS Risk
**File:** `backend/src/index.ts:51`

**Issue:** 50MB JSON limit without rate limiting enables memory exhaustion DoS.

```typescript
app.use(express.json({ limit: '50mb' }))
```

**Remediation:**
- [ ] Reduce payload limit to 10MB
- [ ] Add rate limiting (already done, see Previously Fixed)

---

### 4. [Backend] No Response Size Limits on Fetch
**Files:** `backend/src/services/gemini.ts:69, 134` and `backend/src/routes/items.ts:244`

**Issue:** Multiple fetch calls download remote content into memory without size limits:
- Gemini service fetches images with no size check
- Video processing endpoint downloads entire videos into memory with `response.arrayBuffer()` before writing to disk

**Attack vector:** Providing URLs to very large files can cause OOM crashes.

**Remediation:**
- [ ] Check `Content-Length` header before downloading
- [ ] Implement streaming with size cutoff for large files
- [ ] Add fetch timeout

```typescript
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
const contentLength = parseInt(response.headers.get('content-length') || '0');
if (contentLength > MAX_SIZE) {
  throw new Error('Response too large');
}
```

---

## MEDIUM

### 5. [Backend] Weak Model Parameter Validation
**File:** `backend/src/routes/llm.ts:99, 127, 157`

**Issue:** Model parameter defaults to a fallback but is not validated against an explicit allowlist.

**Remediation:**
- [ ] Use explicit allowlist of valid model identifiers

```typescript
const ALLOWED_MODELS = ['claude-sonnet', 'claude-opus', 'gemini-flash', 'gemini-pro', 'gemini-imagen'];
if (!ALLOWED_MODELS.includes(model)) {
  return res.status(400).json({ error: 'Invalid model' });
}
```

---

### 6. [Backend] Error Messages Leak Infrastructure Details
**Files:** `backend/src/services/s3.ts:88, 116, 136, 164` and `backend/src/routes/items.ts:246`

**Issue:** Error messages reveal S3 usage, status codes, and internal URLs to clients.

**Remediation:**
- [ ] Return generic error messages to clients
- [ ] Log detailed errors server-side only

---

### ~~7. [Backend] No Rate Limiting on Workspace Endpoints~~ FIXED
General rate limiter (1000/15min) applied to all `/api/workspaces` routes. Workspace creation (`POST /api/workspaces`) additionally limited to 10 per 15 minutes via `workspaceCreateLimiter` (configurable with `RATE_LIMIT_WORKSPACE_CREATE` env var).

---

### 8. [Backend] Missing itemId and Extension Validation in Upload Endpoints
**Files:** `backend/src/routes/items.ts:49, 59-62`

**Issue:** The `upload-image` and `upload-video` endpoints validate `sceneId` as UUID but do not validate `itemId` format. The file extension is extracted from `filename` without sanitizing (could contain path separators or multiple dots).

**Mitigating factor:** The disk storage layer's `validatePath()` catches path traversal in local mode, and S3 treats keys as flat strings. So this is a defense-in-depth issue, not directly exploitable.

**Remediation:**
- [ ] Validate `itemId` as UUID (same as `sceneId`)
- [ ] Validate extracted extension against an allowlist (e.g., `png`, `jpg`, `gif`, `webp`, `mp4`, `webm`)

```typescript
const ALLOWED_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])
if (!ALLOWED_IMAGE_EXTS.has(ext)) ext = 'png'
```

---

### 9. [Frontend] API Keys Stored with Weak Obfuscation
**File:** `frontend/src/utils/apiKeyStorage.ts`

**Issue:** API keys stored in `localStorage` with basic character rotation + base64 encoding (not encryption).

**Mitigating factor:** The code documents this is obfuscation, not encryption.

**Remediation:**
- [ ] Consider using `sessionStorage` instead (cleared on tab close)
- [ ] Add clear UI warning when storing keys

---

### 10. [Frontend] No Data URL Size Validation
**File:** `frontend/src/components/InfiniteCanvas.tsx` (image drop/paste handlers)

**Issue:** Large images converted to data URLs can cause memory exhaustion. Data URL is created before scaling checks.

**Remediation:**
- [ ] Validate file size before converting to data URL (e.g., 10MB max)

---

### 11. [Backend/Frontend] CSRF Protection Relies on sameSite: lax
**Files:** `backend/src/index.ts:59` (cookie config), `backend/src/index.ts:33-50` (CORS config)

**Issue:** Cookie-session auth is now in place. CSRF mitigation relies on:
- `sameSite: 'lax'` — prevents cookies from being sent on cross-site POST/PUT/DELETE (good)
- CORS origin checking — blocks cross-origin JS requests (good)

Residual risk: `sameSite: 'lax'` still allows cookies on cross-site top-level GET navigations. No state-changing GET endpoints exist currently, but this is fragile. Also, CORS allows requests with no `Origin` header (server-to-server), though these don't carry browser cookies.

**Remediation:**
- [ ] Consider upgrading to `sameSite: 'strict'` (may affect UX with external links)
- [ ] Alternatively, add CSRF token validation for state-changing endpoints
- [ ] Ensure no GET endpoint ever has side effects

---

## LOW

### 12. [Backend] Session Cookie Missing `secure` Flag
**File:** `backend/src/index.ts:54-60`

**Issue:** The cookie-session config does not set `secure: true`. In production over HTTPS behind a reverse proxy, the session cookie can still be sent over plain HTTP if the client follows an HTTP link.

**Remediation:**
- [ ] Set `secure: true` when running in production (behind HTTPS)
- [ ] Or set it conditionally based on `NODE_ENV` or a config flag

```typescript
app.use(cookieSession({
  // ...
  secure: process.env.NODE_ENV === 'production',
}))
```

---

### 13. [Backend] No Workspace Creation Limit
**File:** `backend/src/routes/workspaces.ts:87`

**Issue:** No limit on the number of workspaces that can be created. An authenticated attacker could create thousands of workspaces, consuming storage and polluting the workspace list.

**Remediation:**
- [ ] Add a maximum workspace count check before creation (e.g., 100)

---

### 14. [Backend] No HTTPS Enforcement
**Remediation:**
- [ ] Use HTTPS in production (typically handled by reverse proxy/load balancer)

### 15. [Backend] No Audit Logging
**Remediation:**
- [ ] Add request logging with user/IP tracking


---


## Testing Checklist

Completed:
- [x] SSRF: Proxy endpoint removed; scene save validates URLs
- [x] Iframe: Scripts cannot execute in sandboxed iframes
- [x] CORS: Requests from unauthorized origins are rejected
- [x] XSS: LLM-generated HTML is sanitized before rendering
- [x] Input Validation: Invalid UUIDs rejected at route level
- [x] JSON Parse: Malformed stored data returns error, doesn't crash
- [x] SSRF (LLM): Image items resolved by ID from storage; no URLs accepted
- [x] Rate Limiting: General (1000/15min), LLM (20/15min), uploads (60/15min), auth login (25/15min), workspace creation (10/15min), workspaces general (1000/15min)
- [x] Auth: Password + cookie-session; all /api/ routes protected when AUTH_PASSWORD is set
- [x] Workspace Isolation: Workspace param always comes from validated URL, not request body; sceneId can only address subfolders within the URL workspace
- [x] Path Traversal (storage layer): diskStorage.validatePath() ensures resolved paths stay within storage root; S3 keys are flat strings

Remaining:
- [ ] Fetch Limits: Large remote files are rejected before full download
- [ ] Upload Input Validation: itemId UUID validation, extension allowlist
