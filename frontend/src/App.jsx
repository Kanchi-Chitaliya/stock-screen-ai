import { useState, useEffect, useCallback, useRef } from 'react'
import StockScreener from './components/StockScreener.jsx'
import StockDetail from './components/StockDetail.jsx'
import AlertsPanel from './components/AlertsPanel.jsx'
import { api } from './api.js'
import { TrendingUp, BookOpen, Bell } from 'lucide-react'

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
            {/* Quick ticker jump */}
            <form
              onSubmit={e => {
                e.preventDefault()
                const t = e.target.ticker.value.trim().toUpperCase()
                if (t) { e.target.reset(); openStock(t) }
              }}
              className="flex gap-1"
            >
              <input
                name="ticker"
                placeholder="Jump to ticker…"
                className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2.5 py-1 w-32 focus:outline-none focus:border-blue-500 placeholder-gray-600"
              />
              <button type="submit" className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded transition-colors">→</button>
            </form>

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
