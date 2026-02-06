# Security Audit TODO

Security audit updated on 2026-02-06 (previous audit: 2026-01-23). Issues organized by severity with remediation plans.

---

## Changes Since Last Audit

### Fixed Issues (Removed)
- **~~SSRF in Image Proxy Endpoint~~** - The `/api/proxy-image` endpoint has been removed entirely.
- **~~Iframe Allows Script Execution~~** - `allow-scripts` removed from iframe sandbox (commit 702e742). Now uses `sandbox="allow-same-origin"` only.
- **~~Path Traversal in S3 File References~~** - URL validation added via `validateItemSrcUrl()` in `scenes.ts` (commit a4e41d5). Only allows data URLs, S3 URLs from the configured bucket, and local storage URLs.
- **~~Unsafe Filename in S3 Key~~** - Upload endpoints now use `itemId.ext` for S3 keys instead of raw filenames. Extension is extracted safely.
- **~~No Content-Type Validation in Proxy~~** - Proxy endpoint removed; no longer applicable.

### New Issues Found
- SSRF via LLM services (Gemini/Claude fetch unvalidated URLs) - #5
- Video fetch without size limits in items.ts - #8
- API keys stored with weak obfuscation in localStorage - #13
- Error messages in items.ts leak internal URLs - added to #11

---

## Summary

| Severity | Backend | Frontend | Total |
|----------|---------|----------|-------|
| Critical | 0 | 0 | 0 |
| High | 4 | 2 | 6 |
| Medium | 5 | 3 | 8 |
| Low | 3 | 3 | 6 |
| **Total** | **12** | **8** | **20** |

---

## CRITICAL

### ~~1. [Backend] Overly Permissive CORS~~ FIXED
**File:** `backend/src/index.ts:18`

CORS now restricted to localhost (any port, for dev) and origins specified via `ALLOWED_ORIGINS` env var (for production). All other origins are rejected.

---

## HIGH

### 2. [Backend] Missing Authentication/Authorization & Rate Limiting
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

### 3. [Backend] Large Payload DoS Risk
**File:** `backend/src/index.ts:19`

**Issue:** 50MB JSON limit without rate limiting enables memory exhaustion DoS.

```typescript
app.use(express.json({ limit: '50mb' }))
```

**Remediation:**
- [ ] Reduce payload limit to 10MB
- [ ] Add rate limiting (see #2)

```typescript
app.use(express.json({ limit: '10mb' }))
```

---

### ~~4. [Backend] Missing Input Validation on Scene ID~~ FIXED
**File:** `backend/src/routes/scenes.ts`, `backend/src/routes/items.ts`

Added `router.param('id')` middleware in scenes router to validate all `:id` params as UUIDs. Added explicit `uuidValidate()` checks in items router for `sceneId` from request body.

---

### 5. [Backend] SSRF via LLM Services (NEW)
**Files:** `backend/src/services/gemini.ts:69, 134` and `backend/src/services/claude.ts:57`

**Issue:** When processing image items for LLM calls, `item.src` URLs are fetched (Gemini) or passed to the API (Claude) without validation. While scene save now validates URLs, the LLM endpoint receives items directly from the frontend and does NOT run them through `validateItemSrcUrl()`.

```typescript
// gemini.ts:69 - fetches arbitrary URLs
const response = await fetch(item.src)

// claude.ts:57 - passes arbitrary URL to Claude API
source: { type: 'url', url: item.src }
```

**Attack vectors:**
- `item.src = "http://169.254.169.254/latest/meta-data/"` (AWS credentials via Gemini fetch)
- `item.src = "http://localhost:4000/api/scenes"` (internal API access)

**Remediation:**
- [ ] Reuse `validateItemSrcUrl()` in LLM route before passing items to services
- [ ] Add URL validation directly in Gemini/Claude services as defense-in-depth

---

### 6. [Frontend] No HTML Sanitization for LLM Output
**File:** `frontend/src/App.tsx` (generateHtml flow) and `frontend/src/components/InfiniteCanvas.tsx:896-897`

**Issue:** LLM-generated HTML is placed directly into `iframe srcDoc` without sanitization. While `allow-scripts` has been removed from the sandbox, unsanitized HTML can still enable:
- CSS-based content exfiltration
- Form-based credential harvesting (phishing forms inside canvas)
- SVG-based attacks in certain sandbox configurations

```typescript
<iframe srcDoc={item.html} sandbox="allow-same-origin" ... />
```

**Remediation:**
- [ ] Install and use DOMPurify to sanitize before rendering

```bash
npm install dompurify @types/dompurify
```

```typescript
import DOMPurify from 'dompurify';
const sanitizedHtml = DOMPurify.sanitize(htmlContent, {
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
});
```

---

### 7. [Frontend] Unescaped RegExp Constructor
**File:** `frontend/src/utils/spatialJson.ts:80`

**Issue:** Image IDs used directly in RegExp constructor without escaping special characters.

```typescript
result = result.replace(new RegExp(imageId, 'g'), src)
```

**Note:** `htmlExport.ts` has similar RegExp usage but correctly escapes input (line 164). `spatialJson.ts` does not.

**Remediation:**
- [ ] Use string split/join instead of RegExp

```typescript
result = result.split(imageId).join(src)
```

---

### 8. [Backend] No Response Size Limits on Fetch (UPDATED)
**Files:** `backend/src/services/gemini.ts:69, 134` and `backend/src/routes/items.ts:241`

**Issue:** Multiple fetch calls download remote content into memory without size limits:
- Gemini service fetches images with no size check
- Video processing endpoint (`items.ts:241`) downloads entire videos into memory with `response.arrayBuffer()` before writing to disk

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

### 9. [Backend] Unsafe JSON Parsing
**File:** `backend/src/routes/scenes.ts:180, 667, 819, 868`

**Issue:** `JSON.parse()` without try-catch can crash on malformed stored data.

**Remediation:**
- [ ] Wrap all JSON.parse calls in try-catch
- [ ] Return appropriate error responses

```typescript
let storedScene: StoredScene;
try {
  storedScene = JSON.parse(sceneJson);
} catch (e) {
  return res.status(500).json({ error: 'Corrupted scene data' });
}
```

---

### 10. [Backend] Weak Model Parameter Validation
**File:** `backend/src/routes/llm.ts:92, 119, 152`

**Issue:** Model parameter defaults to a fallback but is not validated against an explicit allowlist. Type guards exist but don't prevent arbitrary model strings from reaching the API.

**Remediation:**
- [ ] Use explicit allowlist of valid model identifiers

```typescript
const ALLOWED_MODELS = ['claude-sonnet', 'claude-opus', 'gemini-flash', 'gemini-pro', 'gemini-imagen'];
if (!ALLOWED_MODELS.includes(model)) {
  return res.status(400).json({ error: 'Invalid model' });
}
```

---

### 11. [Backend] Error Messages Leak Infrastructure Details
**Files:** `backend/src/services/s3.ts:88, 116, 136, 164` and `backend/src/routes/items.ts:243`

**Issue:** Error messages reveal S3 usage, status codes, and internal URLs to clients.

```typescript
// s3.ts
throw new Error(`S3 PUT failed: ${response.status} ${response.statusText}`)

// items.ts:243
return res.status(400).json({ error: `Failed to fetch source video: ${sourceUrl}` })
```

**Remediation:**
- [ ] Return generic error messages to clients
- [ ] Log detailed errors server-side only

---

### 12. [Backend] Missing Security Headers
**Issue:** No security headers configured (no X-Content-Type-Options, X-Frame-Options, CSP, HSTS, etc.).

**Remediation:**
- [ ] Add helmet middleware

```bash
npm install helmet
```

```typescript
import helmet from 'helmet';
app.use(helmet());
```

---

### 13. [Frontend] API Keys Stored with Weak Obfuscation (NEW)
**File:** `frontend/src/utils/apiKeyStorage.ts`

**Issue:** API keys for Anthropic/Google are stored in `localStorage` with basic character rotation + base64 encoding (not encryption). Anyone with browser access or a malicious extension can retrieve the keys.

**Mitigating factor:** The code documents this is obfuscation, not encryption.

**Remediation:**
- [ ] Consider using `sessionStorage` instead (cleared on tab close)
- [ ] Add clear UI warning when storing keys
- [ ] Consider requiring re-entry per session rather than persisting

---

### 14. [Frontend] No Data URL Size Validation
**File:** `frontend/src/components/InfiniteCanvas.tsx` (image drop/paste handlers)

**Issue:** Large images converted to data URLs can cause memory exhaustion. While image scaling exists, the data URL is created before scaling checks.

**Remediation:**
- [ ] Validate file size before converting to data URL
- [ ] Add maximum file size check (e.g., 10MB)

```typescript
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
if (file.size > MAX_IMAGE_SIZE) {
  alert('Image too large. Maximum size is 10MB.');
  return;
}
```

---

### 15. [Frontend] Missing CSRF Protection
**File:** `frontend/src/api/scenes.ts` and other API modules

**Issue:** State-changing requests lack CSRF tokens. Currently mitigated by SPA architecture (same-origin requests via Vite proxy, no cookie-based auth). Will become critical if cookie-based authentication is added.

**Remediation:**
- [ ] Implement CSRF token flow when adding authentication
- [ ] Document that this must be addressed before adding cookie-based auth

---

### ~~16. [Frontend] Vulnerable Vite Version~~ FIXED
**File:** `frontend/package.json`

Updated from Vite `^5.0.0` to `^6.0.0` (resolves to 6.4.1). Committed in `0f2c7ad`.

---

## LOW

### 17. [Backend] No HTTPS Enforcement
**Remediation:**
- [ ] Use HTTPS in production (typically handled by reverse proxy/load balancer)

### 18. [Backend] No Audit Logging
**Remediation:**
- [ ] Add request logging with user/IP tracking

### 19. [Backend] Silent Image Fetch Failures in Gemini Service
**File:** `backend/src/services/gemini.ts:79-81`

**Issue:** Failed image fetches are caught and silently ignored, continuing the LLM request without the image.

**Remediation:**
- [ ] Report errors to client instead of silently continuing

### 20. [Frontend] No Canvas Item Limit
**Remediation:**
- [ ] Add MAX_ITEMS_PER_SCENE constant and enforce

### 21. [Frontend] No Scene Name Length Validation
**File:** `frontend/src/App.tsx` (renameScene)

**Remediation:**
- [ ] Limit scene names to 255 characters

### 22. [Frontend] Missing URL Validation on Frontend API Calls
**File:** `frontend/src/api/scenes.ts` and other API modules

**Issue:** Scene IDs and other parameters used in URL construction without client-side validation.

**Remediation:**
- [ ] Validate parameters before constructing API URLs

---

## Implementation Priority

### Phase 1 - High Priority (This Sprint)
2. Add rate limiting (#2)
3. Reduce payload size limit (#3)
4. Add scene ID validation (#4)
5. Fix SSRF in LLM services (#5)
6. Sanitize LLM HTML output (#6)
7. Fix unescaped RegExp (#7)
8. Add fetch response size limits (#8)

### Phase 3 - Medium Priority (Next Sprint)
9. Add authentication system (#2)
10. Fix unsafe JSON.parse (#9)
11. Validate model parameters (#10)
12. Improve error messages (#11)
13. Add security headers (#12)
14. Add CSRF protection (#15)
15. Update Vite (#16)

### Phase 4 - Low Priority (Backlog)
16. Add audit logging (#18)
17. Add input limits (#20, #21)
18. Improve error reporting (#19)
19. Add frontend URL validation (#22)

---

## Testing Checklist

After implementing fixes, verify:

- [x] SSRF: Proxy endpoint removed; scene save validates URLs
- [x] Iframe: Scripts cannot execute in sandboxed iframes
- [x] CORS: Requests from unauthorized origins are rejected
- [ ] SSRF (LLM): Cannot pass internal URLs through LLM image items
- [ ] Rate Limiting: Excessive requests are throttled
- [ ] XSS: LLM-generated HTML is sanitized before rendering
- [x] Input Validation: Invalid UUIDs rejected at route level
- [ ] Fetch Limits: Large remote files are rejected before full download
- [ ] JSON Parse: Malformed stored data returns error, doesn't crash
