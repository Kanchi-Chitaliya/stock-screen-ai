import { useState, useEffect, useRef, useCallback } from 'react'
import { api, fmt, fmtLarge, colorForPE, colorForGrowth, grahamScoreColor } from '../api.js'
import { ArrowUpDown, ArrowUp, ArrowDown, Search, RefreshCw, Filter, Database, Zap } from 'lucide-react'

const COLS = [
  { key: 'symbol',        label: 'Ticker',        align: 'left' },
  { key: 'name',          label: 'Name',           align: 'left',  maxW: 'max-w-[180px]' },
  { key: 'sector',        label: 'Sector',         align: 'left',  maxW: 'max-w-[120px]' },
  { key: 'price',         label: 'Price',          align: 'right' },
  { key: 'market_cap',    label: 'Mkt Cap',        align: 'right' },
  { key: 'pe_ratio',      label: 'P/E',            align: 'right' },
  { key: 'p_fcf',         label: 'P/FCF',          align: 'right' },
  { key: 'revenue_growth',label: 'Rev Growth',     align: 'right' },
  { key: 'profit_margin', label: 'Net Margin',     align: 'right' },
  { key: 'graham_score',  label: 'Graham /10',     align: 'right' },
  { key: 'ai_score',      label: 'AI Score /10',   align: 'right' },
  { key: 'ai_fair_value', label: 'Fair Value',     align: 'right' },
]

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <ArrowUpDown size={12} className="text-gray-600 ml-1 inline" />
  return sortDir === 'asc'
    ? <ArrowUp size={12} className="text-blue-400 ml-1 inline" />
    : <ArrowDown size={12} className="text-blue-400 ml-1 inline" />
}

export default function StockScreener({ onSelectStock }) {
  const [stocks, setStocks] = useState([])
  const [progress, setProgress] = useState({ processed: 0, total: 0, errors: 0 })
  const [loading, setLoading] = useState(false)
  const [cacheStats, setCacheStats] = useState(null)
  const [errors, setErrors] = useState([])
  const [index, setIndex] = useState('top_25')
  const [sortKey, setSortKey] = useState('market_cap')
  const [sortDir, setSortDir] = useState('desc')
  const [search, setSearch] = useState('')
  const [sectorFilter, setSectorFilter] = useState('All')
  const esRef = useRef(null)

  const startStream = useCallback((idx) => {
    if (esRef.current) esRef.current.close()
    setStocks([])
    setErrors([])
    setLoading(true)
    setProgress({ processed: 0, total: 0, errors: 0 })

    // fetch cache stats to show in header
    fetch('/api/cache/stats').then(r => r.json()).then(setCacheStats).catch(() => {})

    esRef.current = api.streamScreener(
      idx,
      (stock, processed, total) => {
        setStocks(prev => [...prev, stock])
        setProgress(p => ({ ...p, processed, total }))
      },
      (processed, total) => {
        setProgress(p => ({ ...p, processed, total }))
      },
      () => {
        setLoading(false)
        fetch('/api/cache/stats').then(r => r.json()).then(setCacheStats).catch(() => {})
      },
      (err) => {
        setProgress(p => ({ ...p, errors: (p.errors || 0) + 1 }))
        setErrors(prev => [...prev, err.message || 'Unknown error'])
      },
    )
  }, [])

  useEffect(() => {
    startStream(index)
    return () => esRef.current?.close()
  }, [index, startStream])

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sectors = ['All', ...new Set(stocks.map(s => s.sector).filter(Boolean).sort())]

  const filtered = stocks
    .filter(s => {
      const q = search.toLowerCase()
      return (s.symbol?.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q))
        && (sectorFilter === 'All' || s.sector === sectorFilter)
    })
    .sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey]
      if (sortKey === 'graham_score') { av = a.graham_score?.score; bv = b.graham_score?.score }
      if (sortKey === 'ai_fair_value') {
        av = a.ai_fair_value ? (a.ai_fair_value.low + a.ai_fair_value.high) / 2 : null
        bv = b.ai_fair_value ? (b.ai_fair_value.low + b.ai_fair_value.high) / 2 : null
      }
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })

  const cellVal = (s, key) => {
    switch (key) {
      case 'price': {
        const exPrice  = s.post_market_price ?? s.pre_market_price
        const exChange = s.post_market_price ? s.post_market_change : s.pre_market_change
        const exLabel  = s.post_market_price ? 'AH' : s.pre_market_price ? 'PM' : null
        const exColor  = exChange == null ? 'text-gray-500' : exChange >= 0 ? 'text-emerald-400' : 'text-red-400'
        return (
          <div className="text-right">
            <div className="font-mono">${fmt(s.price, { decimals: 2 })}</div>
            {exPrice && (
              <div className={`text-xs font-mono ${exColor} leading-none mt-0.5`}>
                <span className="text-gray-600">{exLabel} </span>${exPrice.toFixed(2)}
              </div>
            )}
          </div>
        )
      }
      case 'market_cap':    return <span className="font-mono">{fmtLarge(s.market_cap)}</span>
      case 'pe_ratio':      return <span className={`font-mono ${colorForPE(s.pe_ratio)}`}>{fmt(s.pe_ratio)}</span>
      case 'p_fcf':         return <span className={`font-mono ${colorForPE(s.p_fcf)}`}>{fmt(s.p_fcf)}</span>
      case 'ev_ebitda':     return <span className={`font-mono ${colorForPE(s.ev_ebitda)}`}>{fmt(s.ev_ebitda)}</span>
      case 'revenue_growth':return <span className={`font-mono ${colorForGrowth(s.revenue_growth)}`}>{fmt(s.revenue_growth, { pct: true })}</span>
      case 'profit_margin': return <span className={`font-mono ${colorForGrowth(s.profit_margin)}`}>{fmt(s.profit_margin, { pct: true })}</span>
      case 'graham_score': {
        const gs = s.graham_score?.score
        return <span className={`font-mono font-semibold ${grahamScoreColor(gs)}`}>{gs != null ? `${gs}/10` : '—'}</span>
      }
      case 'ai_score': {
        const sc = s.ai_score
        const verdict = s.ai_verdict
        const color = sc == null ? 'text-gray-600' : sc >= 7 ? 'text-emerald-400' : sc >= 5 ? 'text-yellow-400' : 'text-red-400'
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className={`font-mono font-semibold ${color}`}>{sc != null ? sc.toFixed(1) : '—'}</span>
            {verdict && <span className={`text-[10px] px-1 py-0.5 rounded font-medium border ${
              verdict === 'STRONG BUY' ? 'text-emerald-300 bg-emerald-950 border-emerald-700' :
              verdict === 'BUY'        ? 'text-emerald-400 bg-emerald-950/60 border-emerald-800' :
              verdict === 'HOLD'       ? 'text-yellow-400 bg-yellow-950/60 border-yellow-800' :
              verdict === 'REDUCE'     ? 'text-orange-400 bg-orange-950/60 border-orange-800' :
                                        'text-red-400 bg-red-950/60 border-red-800'
            }`}>{verdict}</span>}
          </span>
        )
      }
      case 'ai_fair_value': {
        const fv = s.ai_fair_value
        if (!fv) return <span className="text-gray-600">—</span>
        const price = s.price
        const mid = fv.mid ?? (fv.low + fv.high) / 2
        const upside = price ? ((mid / price) - 1) * 100 : null
        return (
          <span className="inline-flex flex-col items-end leading-tight">
            <span className="font-mono font-semibold text-blue-300">${mid.toLocaleString()}</span>
            <span className="font-mono text-[10px] text-gray-600">${fv.low.toLocaleString()} – ${fv.high.toLocaleString()}</span>
            {upside != null && (
              <span className={`text-[10px] ${upside > 10 ? 'text-emerald-400' : upside < -10 ? 'text-red-400' : 'text-yellow-400'}`}>
                {upside > 0 ? '+' : ''}{upside.toFixed(0)}% vs price
              </span>
            )}
          </span>
        )
      }
      case 'name':  return <span className="truncate block max-w-[180px] text-gray-200" title={s.name}>{s.name}</span>
      case 'sector':return <span className="truncate block max-w-[120px] text-gray-400 text-xs" title={s.sector}>{s.sector}</span>
      default:      return <span>{s[key] ?? '—'}</span>
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <h1 className="text-xl font-semibold text-white">Stock Screener</h1>
        <div className="flex gap-2 ml-auto items-center flex-wrap">
          {/* Index selector */}
          <select
            value={index}
            onChange={e => setIndex(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded px-3 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="top_25">Top 25</option>
            <option value="combined">NASDAQ 100 + S&P 100</option>
            <option value="nasdaq_100">NASDAQ 100</option>
            <option value="sp_100">S&P 100</option>
          </select>

          {/* Sector filter */}
          <div className="flex items-center gap-1">
            <Filter size={14} className="text-gray-500" />
            <select
              value={sectorFilter}
              onChange={e => setSectorFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded px-3 py-1.5 focus:outline-none focus:border-blue-500"
            >
              {sectors.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2 text-gray-500" />
            <input
              type="text"
              placeholder="Search ticker / name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded pl-8 pr-3 py-1.5 w-52 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Refresh */}
          <button
            onClick={() => startStream(index)}
            disabled={loading}
            className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm rounded px-3 py-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {loading && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Loading stocks… {progress.processed}/{progress.total}</span>
            <span>{stocks.length} loaded{progress.errors > 0 ? `, ${progress.errors} errors` : ''}</span>
          </div>
          <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-1 bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: progress.total ? `${(progress.processed / progress.total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* Error messages */}
      {errors.length > 0 && (
        <div className="mb-4 bg-red-950/30 border border-red-800 rounded-lg p-3">
          <div className="text-sm text-red-300">
            <p className="font-medium mb-1">⚠️ {errors.length} error{errors.length !== 1 ? 's' : ''} during load:</p>
            <ul className="text-xs text-red-400 max-h-20 overflow-y-auto">
              {errors.slice(0, 3).map((err, i) => (
                <li key={i}>• {err}</li>
              ))}
              {errors.length > 3 && <li>• ...and {errors.length - 3} more</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Stats row */}
      {!loading && stocks.length > 0 && (
        <div className="flex items-center gap-3 mb-3">
          <p className="text-xs text-gray-500">
            {filtered.length} of {stocks.length} stocks · click a row to deep-dive
          </p>
          {cacheStats && (
            <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
              cacheStats.valid_entries > 100
                ? 'bg-emerald-950/50 border-emerald-800 text-emerald-400'
                : 'bg-yellow-950/50 border-yellow-800 text-yellow-400'
            }`}>
              {cacheStats.valid_entries > 100
                ? <><Zap size={11} /> {cacheStats.valid_entries} cached</>
                : <><Database size={11} /> {cacheStats.valid_entries} cached</>
              }
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-800 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 border-b border-gray-800">
              {COLS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-200 select-none whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {col.label}
                  <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => (
              <tr
                key={s.symbol}
                onClick={() => onSelectStock(s.symbol)}
                className={`border-b border-gray-800/50 cursor-pointer transition-colors hover:bg-blue-950/30 ${i % 2 === 0 ? 'bg-[#0a0e17]' : 'bg-gray-900/30'}`}
              >
                {COLS.map(col => (
                  <td
                    key={col.key}
                    className={`px-4 py-2.5 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.key === 'symbol' ? 'font-semibold text-blue-400' : ''}`}
                  >
                    {cellVal(s, col.key)}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && loading && (
              <tr>
                <td colSpan={COLS.length} className="text-center py-8">
                  <div className="inline-flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
                    <p className="text-xs text-gray-500">Loading stocks...</p>
                  </div>
                </td>
              </tr>
            )}
            {filtered.length === 0 && !loading && stocks.length === 0 && (
              <tr>
                <td colSpan={COLS.length} className="text-center py-12 text-gray-500">
                  <div className="inline-flex flex-col items-center gap-2">
                    <Database size={20} className="opacity-50" />
                    <p className="text-sm">No data loaded yet. Click Refresh to start.</p>
                  </div>
                </td>
              </tr>
            )}
            {filtered.length === 0 && !loading && stocks.length > 0 && (
              <tr>
                <td colSpan={COLS.length} className="text-center py-12 text-gray-500">
                  <p className="text-sm">No stocks match your filters.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
