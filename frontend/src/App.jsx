import { useState, useEffect, useCallback } from 'react'
import StockScreener from './components/StockScreener.jsx'
import StockDetail from './components/StockDetail.jsx'
import { TrendingUp, BookOpen } from 'lucide-react'

// ── Hash routing ──────────────────────────────────────────────────────
// /  or /#/          → screener
// /#/stock/AAPL      → stock detail  (shareable / deep-linkable)

function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '')
  const m = hash.match(/^stock\/([A-Z0-9.\-]+)$/i)
  if (m) return { view: 'detail', ticker: m[1].toUpperCase() }
  return { view: 'screener', ticker: null }
}

function pushHash(view, ticker) {
  window.history.pushState(null, '', view === 'detail' && ticker ? `#/stock/${ticker}` : '#/')
}

export default function App() {
  const [nav, setNav] = useState(() => parseHash())

  const go = useCallback((view, ticker = null) => {
    pushHash(view, ticker)
    setNav({ view, ticker })
  }, [])

  // Browser back/forward
  useEffect(() => {
    const onPop = () => setNav(parseHash())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const openStock    = useCallback((t) => go('detail', t), [go])
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
            <BookOpen size={12} />Fundamentals-first investing
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
            <form onSubmit={e => { e.preventDefault(); const t = e.target.ticker.value.trim().toUpperCase(); if (t) { e.target.reset(); openStock(t) } }} className="flex gap-1">
              <input name="ticker" placeholder="Jump to ticker…"
                className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2.5 py-1 w-32 focus:outline-none focus:border-blue-500 placeholder-gray-600" />
              <button type="submit" className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded transition-colors">→</button>
            </form>
            <span className="text-xs text-gray-500 hidden sm:block">NASDAQ 100 · S&amp;P 100</span>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        {nav.view === 'screener' && <StockScreener onSelectStock={openStock} />}
        {nav.view === 'detail' && nav.ticker && <StockDetail ticker={nav.ticker} onBack={backToScreener} />}
      </main>
    </div>
  )
}
