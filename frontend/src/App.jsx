import { useState, useEffect, useCallback, useRef } from 'react'
import StockScreener from './components/StockScreener.jsx'
import StockDetail from './components/StockDetail.jsx'
import AlertsPanel from './components/AlertsPanel.jsx'
import { api } from './api.js'
import { TrendingUp, BookOpen, Bell, Search } from 'lucide-react'

// ── Global autocomplete search ────────────────────────────────────────────
function GlobalSearch({ onSelect }) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [open, setOpen]         = useState(false)
  const [active, setActive]     = useState(-1)
  const timerRef                = useRef(null)
  const wrapRef                 = useRef(null)

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      api.searchStocks(query)
        .then(r => { setResults(r); setOpen(r.length > 0); setActive(-1) })
        .catch(() => {})
    }, 200)
    return () => clearTimeout(timerRef.current)
  }, [query])

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const commit = (symbol) => {
    setQuery(''); setResults([]); setOpen(false); setActive(-1)
    onSelect(symbol)
  }

  const onKey = (e) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter') {
      if (active >= 0) { commit(results[active].symbol) }
      else if (query.trim()) { commit(query.trim().toUpperCase()) }
    }
    if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 focus-within:border-blue-500 transition-colors w-52">
        <Search size={12} className="text-gray-500 shrink-0" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search ticker or name…"
          className="bg-transparent text-gray-200 text-xs w-full focus:outline-none placeholder-gray-600"
        />
      </div>

      {open && (
        <div className="absolute top-full mt-1 left-0 w-72 bg-[#0d1220] border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50">
          {results.map((r, i) => (
            <button
              key={r.symbol}
              onMouseDown={() => commit(r.symbol)}
              onMouseEnter={() => setActive(i)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                i === active ? 'bg-blue-600/20' : 'hover:bg-gray-800/60'
              }`}
            >
              <span className="font-mono font-bold text-blue-400 text-sm w-14 shrink-0">{r.symbol}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-200 truncate">{r.name}</div>
                {r.sector && <div className="text-[10px] text-gray-600 truncate">{r.sector}</div>}
              </div>
              {r.price && (
                <span className="font-mono text-xs text-gray-400 shrink-0">${r.price.toFixed(2)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Hash routing ──────────────────────────────────────────────────────────
function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '')
  const m = hash.match(/^stock\/([A-Z0-9.\-]+)$/i)
  if (m) return { view: 'detail', ticker: m[1].toUpperCase() }
  return { view: 'screener', ticker: null }
}

function pushHash(view, ticker) {
  window.history.pushState(null, '', view === 'detail' && ticker ? `#/stock/${ticker}` : '#/')
}

// ── Browser notification helpers ─────────────────────────────────────────
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied')  return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

function showBrowserNotification(alert) {
  if (Notification.permission !== 'granted') return
  const isAbove = alert.direction === 'above'
  const n = new Notification(`🔔 ${alert.ticker} price alert`, {
    body: `${alert.name} has ${isAbove ? 'risen above' : 'fallen below'} $${alert.target_price.toFixed(2)} — now $${alert.triggered_price?.toFixed(2)}`,
    icon: '/favicon.ico',
    tag:  `alert-${alert.id}`,
  })
  n.onclick = () => { window.focus(); n.close() }
}

// ── App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [nav, setNav]             = useState(() => parseHash())
  const [showAlerts, setShowAlerts] = useState(false)
  const [activeCount, setActiveCount] = useState(0)
  const pollRef = useRef(null)

  const go = useCallback((view, ticker = null) => {
    pushHash(view, ticker)
    setNav({ view, ticker })
  }, [])

  useEffect(() => {
    const onPop = () => setNav(parseHash())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // ── Refresh active alert count whenever panel opens/closes ────────────
  const refreshCount = useCallback(() => {
    api.getAlerts()
      .then(alerts => setActiveCount(alerts.filter(a => !a.triggered).length))
      .catch(() => {})
  }, [])

  useEffect(() => { refreshCount() }, [showAlerts])

  // ── Poll for triggered alerts every 30s → browser notifications ───────
  useEffect(() => {
    const poll = async () => {
      try {
        const pending = await api.getPendingNotifications()
        if (pending?.length) {
          const granted = await requestNotificationPermission()
          pending.forEach(a => {
            if (granted) showBrowserNotification(a)
          })
          refreshCount()
        }
      } catch { /* ignore */ }
    }

    poll() // immediate first check
    pollRef.current = setInterval(poll, 30_000)
    return () => clearInterval(pollRef.current)
  }, [])

  const openStock      = useCallback((t) => go('detail', t), [go])
  const backToScreener = useCallback(() => go('screener'), [go])

  return (
    <div className="min-h-screen bg-[#0a0e17] text-gray-100">
      <header className="border-b border-gray-800 bg-[#0d1220] sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center gap-3">
          <button onClick={backToScreener}
            className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors">
            <TrendingUp size={20} />
            <span className="font-semibold text-white text-lg">StockScreenAI</span>
          </button>
          <span className="text-gray-600 text-xs ml-1 flex items-center gap-1">
            <BookOpen size={12} /> Fundamentals-first investing
          </span>

          {nav.view === 'detail' && nav.ticker && (
            <div className="flex items-center gap-1.5 ml-3 text-sm">
              <button onClick={backToScreener} className="text-gray-500 hover:text-gray-300 transition-colors">Screener</button>
              <span className="text-gray-700">/</span>
              <span className="text-gray-200 font-mono font-semibold">{nav.ticker}</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-3">
            <GlobalSearch onSelect={openStock} />
            <span className="text-xs text-gray-500 hidden sm:block">NASDAQ 100 · S&amp;P 100</span>

            {/* Global alerts bell */}
            <button
              onClick={() => setShowAlerts(v => !v)}
              className={`relative p-1.5 rounded-lg transition-colors ${
                showAlerts ? 'bg-yellow-500/10 text-yellow-400' : 'text-gray-500 hover:text-yellow-400 hover:bg-yellow-500/10'
              }`}
              title="Price alerts"
            >
              <Bell size={16} />
              {activeCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-yellow-500 text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                  {activeCount > 9 ? '9+' : activeCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        {nav.view === 'screener' && <StockScreener onSelectStock={openStock} />}
        {nav.view === 'detail' && nav.ticker && (
          <StockDetail ticker={nav.ticker} onBack={backToScreener} />
        )}
      </main>

      {/* Alerts slide-over panel */}
      {showAlerts && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowAlerts(false)}
          />
          {/* Panel */}
          <div className="fixed top-0 right-0 h-full w-full max-w-sm z-50 bg-[#0d1220] border-l border-gray-800 shadow-2xl flex flex-col">
            <AlertsPanel onClose={() => { setShowAlerts(false); refreshCount() }} />
          </div>
        </>
      )}
    </div>
  )
}
