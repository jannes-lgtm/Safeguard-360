/**
 * Universal adapter: works for both Vercel (Express-style req/res) and
 * Netlify (event/context with return value).
 *
 * Detection: Vercel passes a real http.ServerResponse as the second argument,
 * which always has writeHead(). Netlify's context object does not.
 */
export function adapt(handler) {
  return async (reqOrEvent, resOrContext) => {
    // Vercel: second arg is a real http.ServerResponse — pass through directly.
    // All _handler functions are already Express-style so no conversion needed.
    if (typeof resOrContext?.writeHead === 'function') {
      try {
        await handler(reqOrEvent, resOrContext)
      } catch (e) {
        console.error('[adapter] handler error:', e.message, e.stack)
        if (!resOrContext.headersSent) {
          resOrContext.status(500).json({ error: e.message })
        }
      }
      return
    }

    // Netlify: convert (event, context) → Express-style (req, res) + return value
    const event   = reqOrEvent
    const query   = event.queryStringParameters || {}
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    let statusCode = 200
    let body       = null

    const req = {
      query,
      method:  event.httpMethod,
      headers: event.headers || {},
      body:    tryParseBody(event.body),
    }

    const res = {
      status(code)    { statusCode = code; return this },
      setHeader(k, v) { headers[k] = v;    return this },
      json(data) {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify(data)
      },
      send(data) {
        body = typeof data === 'string' ? data : JSON.stringify(data)
      },
      end(data) {
        body = data || ''
      },
    }

    try {
      await handler(req, res)
    } catch (e) {
      console.error('[adapter] handler error:', e.message, e.stack)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: e.message }),
      }
    }

    return { statusCode, headers, body }
  }
}

function tryParseBody(body) {
  if (!body) return undefined
  try { return JSON.parse(body) } catch { return body }
}
