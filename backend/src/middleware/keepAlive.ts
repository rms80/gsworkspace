import type { Request, Response, NextFunction } from 'express'

/**
 * Keeps slow JSON requests (uploads, video processing, LLM calls) alive through reverse proxies.
 *
 * Proxies and load balancers (nginx, AWS ALB, Cloudflare, ...) drop a connection that sends no bytes
 * for a while, often 60s. If a request hasn't responded within KEEPALIVE_DELAY_MS of its body being
 * received, this sends the response headers (status 200) and then a space every KEEPALIVE_INTERVAL_MS
 * until the handler responds. Leading whitespace is valid JSON, so the final body still parses.
 *
 * Once the headers are sent the real status code can't be, so a non-200 status is put in the body
 * as `_status`, and the response is marked with the KEEPALIVE_HEADER header. The frontend's fetch
 * wrapper (frontend/src/api/keepAlive.ts) restores the status, so callers see a normal response.
 * Only res.json responses are supported, which is what the routes this is mounted on use.
 */
export const KEEPALIVE_HEADER = 'X-Keepalive'
const KEEPALIVE_DELAY_MS = 5000
const KEEPALIVE_INTERVAL_MS = 10000

export function keepAlive() {
  return (req: Request, res: Response, next: NextFunction) => {
    let streaming = false
    let delayTimer: ReturnType<typeof setTimeout> | null = null
    let intervalTimer: ReturnType<typeof setInterval> | null = null

    const stop = () => {
      if (delayTimer) clearTimeout(delayTimer)
      if (intervalTimer) clearInterval(intervalTimer)
      delayTimer = intervalTimer = null
    }

    const startStreaming = () => {
      if (res.headersSent || res.writableEnded || res.destroyed) return
      streaming = true
      res.status(200)
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader(KEEPALIVE_HEADER, '1')
      // Cross-origin callers can only read the marker header if it's exposed
      const exposed = res.getHeader('Access-Control-Expose-Headers')
      res.setHeader('Access-Control-Expose-Headers', exposed ? `${exposed}, ${KEEPALIVE_HEADER}` : KEEPALIVE_HEADER)
      // Ask nginx not to buffer the response, so the keep-alive bytes reach any proxy in front of it
      res.setHeader('X-Accel-Buffering', 'no')
      res.flushHeaders()
      res.write(' ')
      intervalTimer = setInterval(() => res.write(' '), KEEPALIVE_INTERVAL_MS)
    }

    // Start counting once the request body has arrived, so nothing is sent while still uploading
    const arm = () => {
      if (!res.writableEnded) delayTimer = setTimeout(startStreaming, KEEPALIVE_DELAY_MS)
    }
    if (req.complete) arm()
    else req.once('end', arm)

    res.on('finish', stop)
    res.on('close', stop)

    const json = res.json.bind(res)
    res.json = (body?: unknown) => {
      stop()
      if (!streaming) return json(body)
      const status = res.statusCode
      const payload = status !== 200 && body !== null && typeof body === 'object' && !Array.isArray(body)
        ? { ...body, _status: status }
        : body
      res.end(JSON.stringify(payload))
      return res
    }

    next()
  }
}
