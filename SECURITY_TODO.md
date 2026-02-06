# Security Audit TODO

Security audit performed on 2026-02-06. Issues organized by severity with remediation plans.

---

## Summary

| Severity | Backend | Frontend | Total |
|----------|---------|----------|-------|
| High | 3 | 0 | 3 |
| Medium | 2 | 3 | 5 |
| Low | 2 | 1 | 3 |
| **Total** | **7** | **4** | **11** |

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

---

## HIGH

### 1. [Backend] Missing Authentication/Authorization & Rate Limiting
**File:** `backend/src/index.ts`

**Issue:** All endpoints are publicly accessible with no user isolation and no rate limiting. This is especially dangerous for:
- `POST /api/llm/generate` - triggers expensive LLM API calls
- `POST /api/items/upload-video` - accepts up to 500MB uploads
- `DELETE /api/scenes/:id` - can delete any scene

**Remediation:**
- [ ] Implement authentication (JWT, OAuth, or API keys)
- [ ] Add per-user data isolation
- [ ] Implement rate limiting

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/api/', limiter);

// Stricter limit for LLM endpoint
const llmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
});
app.use('/api/llm/', llmLimiter);
```

---

### 2. [Backend] Large Payload DoS Risk
**File:** `backend/src/index.ts:19`

**Issue:** 50MB JSON limit without rate limiting enables memory exhaustion DoS.

```typescript
app.use(express.json({ limit: '50mb' }))
```

**Remediation:**
- [ ] Reduce payload limit to 10MB
- [ ] Add rate limiting (see #1)

---

### 3. [Backend] No Response Size Limits on Fetch
**Files:** `backend/src/services/gemini.ts:69, 134` and `backend/src/routes/items.ts:241`

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

### 4. [Backend] Weak Model Parameter Validation
**File:** `backend/src/routes/llm.ts:92, 119, 152`

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

### 5. [Backend] Error Messages Leak Infrastructure Details
**Files:** `backend/src/services/s3.ts:88, 116, 136, 164` and `backend/src/routes/items.ts:243`

**Issue:** Error messages reveal S3 usage, status codes, and internal URLs to clients.

**Remediation:**
- [ ] Return generic error messages to clients
- [ ] Log detailed errors server-side only

---

### 6. [Frontend] API Keys Stored with Weak Obfuscation
**File:** `frontend/src/utils/apiKeyStorage.ts`

**Issue:** API keys stored in `localStorage` with basic character rotation + base64 encoding (not encryption).

**Mitigating factor:** The code documents this is obfuscation, not encryption.

**Remediation:**
- [ ] Consider using `sessionStorage` instead (cleared on tab close)
- [ ] Add clear UI warning when storing keys

---

### 7. [Frontend] No Data URL Size Validation
**File:** `frontend/src/components/InfiniteCanvas.tsx` (image drop/paste handlers)

**Issue:** Large images converted to data URLs can cause memory exhaustion. Data URL is created before scaling checks.

**Remediation:**
- [ ] Validate file size before converting to data URL (e.g., 10MB max)

---

### 8. [Frontend] Missing CSRF Protection
**File:** `frontend/src/api/scenes.ts` and other API modules

**Issue:** State-changing requests lack CSRF tokens. Currently mitigated by SPA architecture (same-origin requests, no cookie-based auth). Will become critical if cookie-based authentication is added.

**Remediation:**
- [ ] Implement CSRF token flow when adding authentication

---

## LOW

### 9. [Backend] No HTTPS Enforcement
**Remediation:**
- [ ] Use HTTPS in production (typically handled by reverse proxy/load balancer)

### 10. [Backend] No Audit Logging
**Remediation:**
- [ ] Add request logging with user/IP tracking

### 11. [Frontend] Missing URL Validation on Frontend API Calls
**File:** `frontend/src/api/scenes.ts` and other API modules

**Issue:** Scene IDs and other parameters used in URL construction without client-side validation.

**Remediation:**
- [ ] Validate parameters before constructing API URLs

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

Remaining:
- [ ] Rate Limiting: Excessive requests are throttled
- [ ] Fetch Limits: Large remote files are rejected before full download
