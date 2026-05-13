import { useState, useEffect, useCallback } from 'react'
import { api, fmtLarge, fmt } from '../api.js'
import { CalendarDays, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'

const WINDOW_OPTIONS = [7, 14, 30, 60]

function DaysBadge({ days }) {
  if (days === 0) return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
      Today
    </span>
  )
  if (days === 1) return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
      Tomorrow
    </span>
  )
  if (days <= 7) return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
      {days}d
    </span>
  )
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-700/60 text-gray-400">
      {days}d
    </span>
  )
}

function grahamColor(score) {
  if (score == null) return 'text-gray-500'
  if (score >= 7)   return 'text-emerald-400'
  if (score >= 4)   return 'text-yellow-400'
  return 'text-red-400'
}

export default function EarningsTracker({ onSelectStock }) {
  const [earnings, setEarnings]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [days, setDays]             = useState(30)
  const [collapsed, setCollapsed]   = useState(false)

  const load = useCallback((d) => {
    setLoading(true)
    setError(null)
    api.getUpcomingEarnings(d)
      .then(data => { setEarnings(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  useEffect(() => { load(days) }, [days, load])

  // Group by date
  const grouped = earnings.reduce((acc, s) => {
    const key = s.next_earnings_date
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {})

  const dateKeys = Object.keys(grouped).sort()

  function formatDateLabel(dateStr, daysUntil) {
    const d = new Date(dateStr + 'T00:00:00Z')
    const weekday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
    const month   = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    if (daysUntil === 0) return `Today · ${month}`
    if (daysUntil === 1) return `Tomorrow · ${month}`
    return `${weekday} · ${month}`
  }

  return (
    <div className="mb-6 bg-[#0d1220] border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
        <CalendarDays size={15} className="text-blue-400 shrink-0" />
        <span className="font-semibold text-gray-100 text-sm">Upcoming Earnings</span>

        {/* Window selector */}
        <div className="flex items-center gap-1 ml-2">
          {WINDOW_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                days === d
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>

        {!loading && !error && (
          <span className="text-xs text-gray-600 ml-1">
            {earnings.length} {earnings.length === 1 ? 'report' : 'reports'}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => load(days)}
            className="p-1 text-gray-600 hover:text-gray-300 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={() => setCollapsed(v => !v)}
            className="p-1 text-gray-600 hover:text-gray-300 transition-colors"
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div>
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-gray-500 text-sm">
              <div className="w-4 h-4 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
              Loading earnings calendar…
            </div>
          )}

          {error && (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              {earnings.length === 0
                ? 'No earnings data yet — run the screener first to populate the calendar.'
                : `Error: ${error}`}
            </div>
          )}

          {!loading && !error && earnings.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              No earnings in the next {days} days found in cache.
              <span className="block text-xs mt-1 text-gray-600">Run the screener to load stock data.</span>
            </div>
          )}

          {!loading && !error && dateKeys.length > 0 && (
            <div className="divide-y divide-gray-800/60">
              {dateKeys.map(dateStr => {
                const group = grouped[dateStr]
                const daysUntil = group[0].days_until
                return (
                  <div key={dateStr}>
                    {/* Date separator */}
                    <div className="px-4 py-1.5 bg-gray-900/40 flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-400">
                        {formatDateLabel(dateStr, daysUntil)}
                      </span>
                      <DaysBadge days={daysUntil} />
                      <span className="text-[10px] text-gray-600 ml-1">{group.length} co.</span>
                    </div>

                    {/* Stock rows */}
                    {group.map(s => (
                      <button
                        key={s.symbol}
                        onClick={() => onSelectStock(s.symbol)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/40 transition-colors text-left"
                      >
                        {/* Ticker + name */}
                        <span className="font-mono font-bold text-blue-400 text-sm w-14 shrink-0">{s.symbol}</span>
                        <span className="text-xs text-gray-300 flex-1 truncate min-w-0">{s.name}</span>

                        {/* Sector tag */}
                        {s.sector && s.sector !== 'N/A' && (
                          <span className="hidden sm:block text-[10px] text-gray-600 w-28 truncate shrink-0">
                            {s.sector}
                          </span>
                        )}

                        {/* Price */}
                        {s.price != null && (
                          <span className="font-mono text-xs text-gray-400 w-16 text-right shrink-0">
                            ${s.price.toFixed(2)}
                          </span>
                        )}

                        {/* Market cap */}
                        <span className="font-mono text-xs text-gray-500 w-16 text-right shrink-0 hidden md:block">
                          {s.market_cap ? fmtLarge(s.market_cap) : '—'}
                        </span>

                        {/* Rev growth */}
                        <span className={`font-mono text-xs w-14 text-right shrink-0 hidden lg:block ${
                          s.revenue_growth == null ? 'text-gray-600'
                          : s.revenue_growth > 0.10 ? 'text-emerald-400'
                          : s.revenue_growth > 0    ? 'text-yellow-400'
                          : 'text-red-400'
                        }`}>
                          {s.revenue_growth != null ? fmt(s.revenue_growth, { pct: true }) : '—'}
                        </span>

                        {/* Graham score */}
                        <span className={`font-mono text-xs w-8 text-right shrink-0 ${grahamColor(s.graham_score)}`}>
                          {s.graham_score != null ? s.graham_score.toFixed(1) : '—'}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
