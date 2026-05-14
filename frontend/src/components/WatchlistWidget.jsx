import { useState, useEffect, useCallback } from 'react'
import { api, fmtLarge } from '../api.js'
import { Bookmark, ChevronDown, ChevronUp, RefreshCw, Plus } from 'lucide-react'

function PctChange({ pct, change }) {
  if (pct == null) return <span className="text-gray-600 text-xs font-mono">—</span>
  const pos = pct >= 0
  return (
    <span className={`font-mono text-xs ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
      {pos ? '+' : ''}{pct.toFixed(2)}%
    </span>
  )
}

export default function WatchlistWidget({ onSelectStock, onOpenWatchlist }) {
  const [watchlists, setWatchlists] = useState([])
  const [loading, setLoading]       = useState(true)
  const [collapsed, setCollapsed]   = useState(false)
  const [openIds, setOpenIds]       = useState({}) // wl.id → expanded

  const load = useCallback(() => {
    setLoading(true)
    api.getWatchlists()
      .then(data => {
        setWatchlists(data)
        // Auto-expand all watchlists that have tickers
        setOpenIds(prev => {
          const next = { ...prev }
          data.forEach(wl => { if (wl.tickers.length > 0 && !(wl.id in prev)) next[wl.id] = true })
          return next
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const totalTickers = watchlists.reduce((n, wl) => n + wl.tickers.length, 0)

  if (!loading && watchlists.length === 0) return null

  return (
    <div className="mb-6 bg-[#0d1220] border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
        <Bookmark size={15} className="text-blue-400 shrink-0" />
        <span className="font-semibold text-gray-100 text-sm">Watchlists</span>
        {!loading && (
          <span className="text-xs text-gray-600 ml-1">
            {watchlists.length} list{watchlists.length !== 1 ? 's' : ''} · {totalTickers} stocks
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => onOpenWatchlist(null, null)}
            className="p-1 text-gray-600 hover:text-blue-400 transition-colors"
            title="Manage watchlists"
          >
            <Plus size={12} />
          </button>
          <button onClick={load} className="p-1 text-gray-600 hover:text-gray-300 transition-colors" title="Refresh">
            <RefreshCw size={12} />
          </button>
          <button onClick={() => setCollapsed(v => !v)} className="p-1 text-gray-600 hover:text-gray-300 transition-colors">
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div>
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-gray-500 text-sm">
              <div className="w-4 h-4 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}

          {!loading && watchlists.map((wl, wlIdx) => (
            <div key={wl.id} className={wlIdx > 0 ? 'border-t border-gray-800/60' : ''}>
              {/* Watchlist name row */}
              <button
                onClick={() => setOpenIds(prev => ({ ...prev, [wl.id]: !prev[wl.id] }))}
                className="w-full flex items-center gap-2 px-4 py-2 bg-gray-900/30 hover:bg-gray-800/40 transition-colors text-left"
              >
                {openIds[wl.id] ? <ChevronDown size={11} className="text-gray-600" /> : <ChevronUp size={11} className="text-gray-600 rotate-180" />}
                <span className="text-xs font-semibold text-gray-300">{wl.name}</span>
                <span className="text-[10px] text-gray-600">{wl.tickers.length} stocks</span>
              </button>

              {/* Ticker rows */}
              {openIds[wl.id] && (
                <div>
                  {wl.tickers.length === 0 ? (
                    <p className="px-4 py-2.5 text-xs text-gray-600 italic">
                      Empty — <button onClick={() => onOpenWatchlist(null, null)} className="text-blue-500 hover:underline">add stocks</button>
                    </p>
                  ) : (
                    wl.tickers.map(t => (
                      <button
                        key={t.symbol}
                        onClick={() => onSelectStock(t.symbol)}
                        className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40 transition-colors text-left"
                      >
                        <span className="font-mono font-bold text-blue-400 text-sm w-14 shrink-0">{t.symbol}</span>
                        <span className="text-xs text-gray-300 flex-1 truncate min-w-0">{t.name}</span>

                        {t.sector && t.sector !== 'N/A' && (
                          <span className="hidden lg:block text-[10px] text-gray-600 w-28 truncate shrink-0">{t.sector}</span>
                        )}

                        <div className="flex items-center gap-3 shrink-0">
                          {t.price != null && (
                            <span className="font-mono text-xs text-gray-300">${t.price.toFixed(2)}</span>
                          )}
                          <PctChange pct={t.regular_market_change_pct} change={t.regular_market_change} />
                          {t.market_cap && (
                            <span className="font-mono text-xs text-gray-500 hidden md:block">{fmtLarge(t.market_cap)}</span>
                          )}
                          {t.stale && <span className="text-[9px] text-gray-700">stale</span>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
