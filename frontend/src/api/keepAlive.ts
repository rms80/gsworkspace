/**
 * Restores the status of responses the backend kept alive for slow requests (see
 * backend/src/middleware/keepAlive.ts). Those are sent as 200 with leading whitespace, with the real
 * status in the body's `_status`, so this rebuilds them as normal responses with that status.
 * Callers keep using response.ok / response.json() as usual.
 */
const KEEPALIVE_HEADER = 'X-Keepalive'

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  404: 'Not Found',
  413: 'Payload Too Large',
  500: 'Internal Server Error',
}

export function installKeepAliveFetch(): void {
  const nativeFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const response = await nativeFetch(input, init)
    if (response.headers.get(KEEPALIVE_HEADER) !== '1') return response

    const text = await response.text()
    let status = 200
    try {
      const body = JSON.parse(text)
      if (body && typeof body._status === 'number') status = body._status
    } catch {
      // The connection ended before the handler responded
      status = 502
    }
    return new Response(text, {
      status,
      statusText: status === 200 ? 'OK' : STATUS_TEXT[status] ?? 'Error',
      headers: response.headers,
    })
  }
}
