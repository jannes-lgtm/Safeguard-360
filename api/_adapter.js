/**
 * Netlify function adapter
 * Converts Netlify's (event, context) format to Express-style (req, res)
 * so all existing function handlers work without modification.
 */
export function adapt(handler) {
  return async (event, context) => {
    const query   = event.queryStringParameters || {}
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    let statusCode = 200
    let body       = null

    const req = {
      query,
      method:  event.httpMethod,
      headers: event.headers || {},
      body:    event.body,
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
