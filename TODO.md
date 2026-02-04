# TODO

## Security

### SSRF in POST /api/scenes/:id endpoint

The scene save endpoint (`POST /api/scenes/:id`) accepts `item.src` URLs for images and videos. If the URL is an HTTP URL not already in the scene folder, it fetches from that URL server-side (scenes.ts lines 318, 415).

In normal operation, `item.src` should only ever be:
- Data URLs
- S3 URLs from our bucket
- Local storage URLs (`/api/local-files/...`)

However, a malicious actor could craft a request with an external URL, causing the server to fetch from arbitrary URLs (SSRF).

**Risk level:** Lower than typical SSRF because:
1. Response is not returned to attacker (saved to storage)
2. Requires valid scene ID
3. POST request (harder to exploit via CSRF)

**Potential fix:** Add URL validation to reject any `item.src` that is not:
- A data URL (`data:...`)
- An S3 URL matching our bucket pattern
- A local URL (`/api/local-files/...`)

**Investigate:** Whether there are any legitimate use cases for external URLs in scene items.
