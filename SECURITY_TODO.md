# Security Audit TODO

Security audit performed on 2026-01-23. Issues organized by severity with remediation plans.

---

## Summary

| Severity | Backend | Frontend | Total |
|----------|---------|----------|-------|
| Critical | 3 | 0 | 3 |
| High | 7 | 3 | 10 |
| Medium | 6 | 5 | 11 |
| Low | 4 | 3 | 7 |
| **Total** | **20** | **11** | **31** |

---

## CRITICAL

### 1. [Backend] SSRF in Image Proxy Endpoint
**File:** `backend/src/index.ts:25-46`

**Issue:** The `/api/proxy-image` endpoint accepts arbitrary URLs and fetches them server-side without validation. Can access internal resources, AWS metadata, local files.

```typescript
// Current (vulnerable)
const url = req.query.url as string
const response = await fetch(url)
```

**Attack vectors:**
- `GET /api/proxy-image?url=http://169.254.169.254/latest/meta-data` (AWS credentials)
- `GET /api/proxy-image?url=http://localhost:4000/api/scenes` (internal API)
- `GET /api/proxy-image?url=file:///etc/passwd` (local files)

**Remediation:**
- [ ] Implement URL allowlist (only allow S3 bucket domain)
- [ ] Validate URL scheme is https only
- [ ] Block private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
- [ ] Add request timeout
- [ ] Validate Content-Type is image/*

```typescript
// Fixed
const ALLOWED_HOSTS = [process.env.S3_BUCKET_NAME + '.s3.amazonaws.com'];
const parsedUrl = new URL(url);
if (!ALLOWED_HOSTS.includes(parsedUrl.host)) {
  return res.status(403).json({ error: 'Domain not allowed' });
}
if (parsedUrl.protocol !== 'https:') {
  return res.status(403).json({ error: 'HTTPS required' });
}
```

---

### 2. [Backend] Overly Permissive CORS
**File:** `backend/src/index.ts:13`

**Issue:** CORS allows requests from any origin.

```typescript
// Current (vulnerable)
app.use(cors())
```

**Remediation:**
- [ ] Restrict to specific origins

```typescript
// Fixed
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}))
```

---

### 3. [Backend] Path Traversal in S3 File References
**File:** `backend/src/routes/scenes.ts:210, 223, 238, 254, 270, 286`

**Issue:** `item.file` from request body used directly in S3 paths without sanitization.

```typescript
// Current (vulnerable)
const text = await loadFromS3(`${sceneFolder}/${item.file}`)
```

**Attack vector:**
```json
{ "items": [{ "type": "text", "file": "../../../other-user/secret.txt" }] }
```

**Remediation:**
- [ ] Validate `item.file` contains no path traversal sequences
- [ ] Ensure file path stays within scene folder

```typescript
// Fixed
import path from 'path';

function sanitizeFilePath(file: string): string {
  const normalized = path.normalize(file).replace(/^(\.\.(\/|\\|$))+/, '');
  if (normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error('Invalid file path');
  }
  return normalized;
}
```

---

## HIGH

### 4. [Backend] Missing Input Validation on Scene ID
**File:** `backend/src/routes/scenes.ts:69, 195, 347, 366, 385`

**Issue:** Scene IDs used in S3 paths without UUID format validation.

**Remediation:**
- [ ] Validate scene ID is valid UUID format

```typescript
import { validate as uuidValidate } from 'uuid';

if (!uuidValidate(id)) {
  return res.status(400).json({ error: 'Invalid scene ID format' });
}
```

---

### 5. [Backend] Weak Model Parameter Validation
**File:** `backend/src/routes/llm.ts:27-52`

**Issue:** Model validation only checks prefix, allowing arbitrary model strings.

**Remediation:**
- [ ] Use explicit allowlist of valid models

```typescript
const ALLOWED_MODELS = ['claude-sonnet', 'claude-opus', 'gemini-1.5-flash', 'gemini-1.5-pro'];
if (!ALLOWED_MODELS.includes(model)) {
  return res.status(400).json({ error: 'Invalid model' });
}
```

---

### 6. [Backend] Missing Authentication/Authorization
**File:** `backend/src/index.ts`

**Issue:** All endpoints are publicly accessible. No user isolation.

**Remediation:**
- [ ] Implement authentication (JWT, OAuth, or API keys)
- [ ] Add per-user data isolation
- [ ] Implement rate limiting

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);
```

---

### 7. [Backend] Large Payload DoS Risk
**File:** `backend/src/index.ts:14`

**Issue:** 50MB JSON limit without rate limiting enables DoS.

**Remediation:**
- [ ] Reduce payload limit to reasonable size (5-10MB)
- [ ] Add rate limiting (see #6)

```typescript
app.use(express.json({ limit: '10mb' }))
```

---

### 8. [Backend] Unsafe JSON Parsing
**File:** `backend/src/routes/scenes.ts:204, 239, 255, 271, 326, 375`

**Issue:** `JSON.parse()` without try-catch can crash on malformed data.

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

### 9. [Backend] Unsafe Filename in S3 Key
**File:** `backend/src/routes/items.ts:48-54`

**Issue:** `filename` parameter used unsanitized in S3 key.

**Remediation:**
- [ ] Sanitize filename, remove path separators
- [ ] Use only the basename

```typescript
const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
const key = `images/${id}-${safeName}`;
```

---

### 10. [Frontend] Iframe Allows Script Execution
**File:** `frontend/src/components/InfiniteCanvas.tsx:1873-1886`

**Issue:** Iframe sandbox allows scripts + same-origin, enabling LLM-generated HTML to execute arbitrary JS with full API access.

```typescript
// Current (vulnerable)
sandbox="allow-same-origin allow-scripts"
```

**Remediation:**
- [ ] Remove `allow-scripts` or implement strict CSP
- [ ] Consider removing `allow-same-origin` if scripts not needed

```typescript
// Fixed - if scripts needed, add CSP
sandbox="allow-forms allow-popups"
// OR with strict CSP headers on backend
```

---

### 11. [Frontend] No HTML Sanitization for LLM Output
**File:** `frontend/src/App.tsx:660-674`

**Issue:** LLM-generated HTML rendered without sanitization.

**Remediation:**
- [ ] Install and use DOMPurify

```bash
npm install dompurify @types/dompurify
```

```typescript
import DOMPurify from 'dompurify';

const htmlContent = stripCodeFences(result).trim();
const sanitizedHtml = DOMPurify.sanitize(htmlContent, {
  ALLOWED_TAGS: ['h1', 'h2', 'h3', 'p', 'div', 'span', 'img', 'a', 'button',
                 'form', 'input', 'textarea', 'style', 'ul', 'ol', 'li', 'table',
                 'tr', 'td', 'th', 'thead', 'tbody'],
  ALLOWED_ATTR: ['class', 'id', 'style', 'src', 'alt', 'href', 'name',
                 'placeholder', 'type', 'value'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
});
```

---

### 12. [Frontend] Unescaped RegExp Constructor
**File:** `frontend/src/utils/spatialJson.ts:80`

**Issue:** User data used in RegExp without escaping.

```typescript
// Current (vulnerable)
result = result.replace(new RegExp(imageId, 'g'), src)
```

**Remediation:**
- [ ] Escape special regex characters or use string split/join

```typescript
// Fixed
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
result = result.replace(new RegExp(escapeRegExp(imageId), 'g'), src);

// OR use split/join (simpler, no regex)
result = result.split(imageId).join(src);
```

---

## MEDIUM

### 13. [Backend] Error Messages Leak Infrastructure Details
**File:** `backend/src/services/s3.ts:64, 92, 112, 140`

**Issue:** Error messages reveal S3 usage and status codes.

**Remediation:**
- [ ] Return generic error messages to clients
- [ ] Log detailed errors server-side only

```typescript
// Log detailed error internally
console.error(`S3 PUT failed: ${response.status}`, { bucket, key });
// Return generic message to client
throw new Error('Storage operation failed');
```

---

### 14. [Backend] No Content-Type Validation in Proxy
**File:** `backend/src/index.ts:37-38`

**Issue:** Proxy trusts remote Content-Type header, could serve malicious content.

**Remediation:**
- [ ] Validate Content-Type is image/*
- [ ] Set explicit safe Content-Type

```typescript
const contentType = response.headers.get('content-type') || '';
if (!contentType.startsWith('image/')) {
  return res.status(400).json({ error: 'Invalid content type' });
}
res.setHeader('Content-Type', contentType);
```

---

### 15. [Backend] No Response Size Limits on Fetch
**File:** `backend/src/index.ts:32`, `backend/src/services/gemini.ts:69, 134`

**Issue:** Fetching remote URLs without size limits enables OOM attacks.

**Remediation:**
- [ ] Implement response size limits

```typescript
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const response = await fetch(url);
const contentLength = parseInt(response.headers.get('content-length') || '0');
if (contentLength > MAX_SIZE) {
  throw new Error('Response too large');
}
```

---

### 16. [Backend] Missing Security Headers
**Issue:** No security headers configured.

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

### 17. [Frontend] Missing CSRF Protection
**File:** `frontend/src/api/scenes.ts`

**Issue:** State-changing requests lack CSRF tokens.

**Remediation:**
- [ ] Implement CSRF token flow (backend generates, frontend sends in header)

---

### 18. [Frontend] No Data URL Size Validation
**File:** `frontend/src/components/InfiniteCanvas.tsx:130-137`

**Issue:** Large data URLs can cause memory exhaustion.

**Remediation:**
- [ ] Add size limit before loading images

```typescript
const MAX_DATA_URL_SIZE = 10 * 1024 * 1024; // 10MB
if (item.src.startsWith('data:') && item.src.length > MAX_DATA_URL_SIZE) {
  console.error('Image data URL too large');
  return;
}
```

---

### 19. [Frontend] Vulnerable Vite/esbuild Version
**File:** `frontend/package.json`

**Issue:** Vite ^5.0.0 uses vulnerable esbuild (<=0.24.2) - CVE affects dev server.

**Remediation:**
- [ ] Update Vite to latest version

```bash
npm update vite
```

---

## LOW

### 20. [Backend] No HTTPS Enforcement
**Remediation:**
- [ ] Use HTTPS in production (typically handled by reverse proxy/load balancer)

### 21. [Backend] No Audit Logging
**Remediation:**
- [ ] Add request logging with user/IP tracking

### 22. [Backend] Silent Image Fetch Failures
**File:** `backend/src/services/gemini.ts:79-81`

**Remediation:**
- [ ] Report errors to client instead of silently continuing

### 23. [Frontend] No Canvas Item Limit
**Remediation:**
- [ ] Add MAX_ITEMS_PER_SCENE constant and enforce

### 24. [Frontend] No Scene Name Length Validation
**Remediation:**
- [ ] Limit scene names to 255 characters

### 25. [Frontend] Potential URL Validation on Proxy Calls
**File:** `frontend/src/components/InfiniteCanvas.tsx:351`

**Remediation:**
- [ ] Validate URLs before sending to proxy endpoint

---

## Implementation Priority

### Phase 1 - Critical (Do Immediately)
1. Fix SSRF in proxy endpoint (#1)
2. Restrict CORS (#2)
3. Fix path traversal (#3)

### Phase 2 - High Priority (This Sprint)
4. Add input validation (#4, #5, #9)
5. Sanitize LLM HTML output (#11)
6. Fix iframe sandbox (#10)
7. Add rate limiting (#6)
8. Fix regex injection (#12)

### Phase 3 - Medium Priority (Next Sprint)
9. Add authentication system (#6)
10. Improve error handling (#8, #13)
11. Add security headers (#16)
12. Update dependencies (#19)
13. Add CSRF protection (#17)

### Phase 4 - Low Priority (Backlog)
14. Add audit logging (#21)
15. Add input limits (#23, #24)
16. Improve error reporting (#22)

---

## Testing Checklist

After implementing fixes, verify:

- [ ] SSRF: Cannot access internal IPs or non-S3 URLs via proxy
- [ ] CORS: Requests from unauthorized origins are rejected
- [ ] Path Traversal: `../` sequences in file paths are rejected
- [ ] XSS: Script tags in LLM output are sanitized
- [ ] Iframe: Scripts cannot access parent page or make API calls
- [ ] Rate Limiting: Excessive requests are throttled
- [ ] Input Validation: Invalid UUIDs and oversized payloads rejected
