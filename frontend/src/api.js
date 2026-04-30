const BASE = '/api'

// Helper to handle HTTP errors with better messages
async function fetchJSON(url, options = {}) {
  try {
    const r = await fetch(url, options)
    if (!r.ok) {
      const errorData = await r.json().catch(() => ({ detail: r.statusText }))
      const message = errorData.detail || errorData.message || r.statusText
      const error = new Error(`HTTP ${r.status}: ${message}`)
      error.status = r.status
      throw error
    }
    return await r.json()
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error('Invalid server response')
    }
    throw err
  }
}

// Retry helper for failed requests
async function withRetry(fn, maxRetries = 2, delayMs = 1000) {
  let lastError
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, i)))
      }
    }
  }
  throw lastError
}

export const api = {
  getIndices: () =>
    withRetry(() => fetchJSON(`${BASE}/indices`)),

  streamScreener(index, onStock, onProgress, onEnd, onError) {
    const es = new EventSource(`${BASE}/screener/stream?index=${index}`)
    let hasError = false
    
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'stock') {
          onStock(msg.data, msg.processed, msg.total)
        } else if (msg.type === 'skip') {
          onProgress?.(msg.processed, msg.total)
        } else if (msg.type === 'error') {
          onError?.({ ticker: msg.ticker, message: 'Failed to fetch data' })
          onProgress?.(msg.processed, msg.total)
        } else if (msg.type === 'end') {
          onEnd?.()
          es.close()
        }
      } catch (err) {
        console.error('Stream parse error:', err)
        if (!hasError) {
          hasError = true
          onError?.({ message: 'Stream parsing error' })
        }
      }
    }
    
    es.onerror = (err) => {
      if (!hasError) {
        hasError = true
        onError?.({ message: 'Connection lost. Retrying...' })
      }
      es.close()
    }
    
    return es
  },

  getStock: (ticker) =>
    withRetry(() => fetchJSON(`${BASE}/stock/${ticker}`)),

  calculateDCF: (ticker, params) =>
    withRetry(() => fetchJSON(`${BASE}/dcf/${ticker}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })),

  getLLMAnalysis: (ticker) =>
    withRetry(() => fetchJSON(`${BASE}/llm/${ticker}`, { method: 'POST' })),

  getAIScore: (ticker) =>
    withRetry(() => fetchJSON(`${BASE}/ai-score/${ticker}`, { method: 'POST' })),
}

export function fmt(v, opts = {}) {
  const { pct = false, prefix = '', suffix = '', decimals = 1, billions = false, millions = false } = opts
  if (v == null || isNaN(v)) return '—'
  if (billions) return `${prefix}${(v / 1e9).toFixed(decimals)}B`
  if (millions) return `${prefix}${(v / 1e6).toFixed(decimals)}M`
  if (pct) return `${(v * 100).toFixed(decimals)}%`
  return `${prefix}${v.toFixed(decimals)}${suffix}`
}

export function fmtLarge(v) {
  if (v == null) return '—'
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (Math.abs(v) >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`
  if (Math.abs(v) >= 1e6)  return `$${(v / 1e6).toFixed(2)}M`
  return `$${v.toFixed(0)}`
}

// Sector-aware P/E thresholds — a 30 P/E is cheap for a quality compounder,
// but expensive for a bank or utility.
const PE_THRESHOLDS = {
  'Financial Services': [12, 18],
  'Banks':              [10, 16],
  'Insurance':          [10, 16],
  'Utilities':          [15, 22],
  'Real Estate':        [20, 30],
  'Energy':             [10, 18],
  'Consumer Defensive': [18, 28],
  'Healthcare':         [20, 35],
  'Technology':         [25, 40],
  'Communication Services': [20, 35],
  'Consumer Cyclical':  [15, 28],
  'Industrials':        [15, 25],
  'Basic Materials':    [12, 20],
}

export function colorForPE(v, sector) {
  if (v == null || isNaN(v) || v <= 0) return 'text-gray-400'
  const [low, high] = PE_THRESHOLDS[sector] ?? [15, 25]
  if (v < low)  return 'text-emerald-400'
  if (v < high) return 'text-yellow-400'
  return 'text-red-400'
}

export function colorForGrowth(v) {
  if (v == null) return 'text-gray-400'
  if (v > 0.10) return 'text-emerald-400'
  if (v > 0)    return 'text-yellow-400'
  return 'text-red-400'
}

// Backend now normalizes D/E to a true ratio (not percentage)
export function colorForDE(v) {
  if (v == null) return 'text-gray-400'
  if (v < 0.5) return 'text-emerald-400'
  if (v < 1.5) return 'text-yellow-400'
  return 'text-red-400'
}

export function grahamScoreColor(score) {
  if (score == null) return 'text-gray-400'
  if (score >= 7) return 'text-emerald-400'
  if (score >= 4) return 'text-yellow-400'
  return 'text-red-400'
}
