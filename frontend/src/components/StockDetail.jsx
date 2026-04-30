import { useState, useEffect } from 'react'
import { api, fmt, fmtLarge, colorForPE, colorForGrowth, colorForDE } from '../api.js'
import GrahamScore from './GrahamScore.jsx'
import DCFCalculator from './DCFCalculator.jsx'
import AIScore from './AIScore.jsx'
import LLMAnalysis from './LLMAnalysis.jsx'
import SentimentAnalysis from './SentimentAnalysis.jsx'
import {
  PriceChart, RevenueChart, MarginsChart, FCFChart, DebtChart, EPSChart,
  ROICChart, SharesChart,
} from './MetricCharts.jsx'
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'

const CHART_TABS = [
  { key: 'price',    label: 'Price' },
  { key: 'revenue',  label: 'Revenue & Earnings' },
  { key: 'margins',  label: 'Margins' },
  { key: 'fcf',      label: 'Cash Flow' },
  { key: 'debt',     label: 'Debt & Equity' },
  { key: 'eps',      label: 'EPS' },
  { key: 'roic',     label: 'ROIC' },
  { key: 'shares',   label: 'Share Count' },
]

const SECTION_TABS = [
  { key: 'overview',   label: 'Overview' },
  { key: 'history',    label: 'Financials Table' },
  { key: 'dcf',        label: 'DCF Calculator' },
  { key: 'graham',     label: 'Graham Score' },
  { key: 'aiscore',    label: '✦ AI Score' },
  { key: 'llm',        label: '✦ AI Analysis' },
  { key: 'sentiment',  label: '✦ Sentiment' },
]

function MetricTile({ label, value, color, sub }) {
  return (
    <div className="bg-gray-800/60 rounded-xl px-4 py-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`font-mono font-semibold text-base ${color ?? 'text-gray-100'}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Earnings beat/miss strip ───────────────────────────────────────────
function EarningsStrip({ earnings }) {
  if (!earnings?.length) return null
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        EPS — Actual vs Estimate (most recent first)
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {earnings.map((e, i) => {
          const dt    = new Date(e.date)
          const q     = Math.floor(dt.getMonth() / 3) + 1
          const label = `Q${q} ${dt.getFullYear()}`
          const { beat, is_future } = e
          const border = is_future
            ? 'border-yellow-700/50 bg-yellow-950/20'
            : beat === true  ? 'border-emerald-700/40 bg-emerald-950/25'
            : beat === false ? 'border-red-700/40 bg-red-950/25'
            : 'border-gray-700 bg-gray-800/40'
          return (
            <div key={i} className={`shrink-0 w-[108px] border rounded-xl p-2.5 text-center ${border}`}>
              <div className="text-xs text-gray-500 mb-1.5">{label}</div>
              {is_future ? (
                <>
                  <div className="text-xs text-gray-600 mb-0.5">Est.</div>
                  <div className="font-mono text-sm text-gray-200">
                    {e.eps_estimate != null ? `$${e.eps_estimate.toFixed(2)}` : '—'}
                  </div>
                  <div className="text-xs text-yellow-400 mt-1.5 font-medium">Upcoming</div>
                </>
              ) : (
                <>
                  <div className={`font-mono text-base font-bold ${beat ? 'text-emerald-400' : beat === false ? 'text-red-400' : 'text-gray-200'}`}>
                    {e.eps_actual != null ? `$${e.eps_actual.toFixed(2)}` : '—'}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    est. {e.eps_estimate != null ? `$${e.eps_estimate.toFixed(2)}` : '—'}
                  </div>
                  {e.surprise_pct != null && (
                    <div className={`text-xs font-semibold mt-1 ${beat ? 'text-emerald-400' : 'text-red-400'}`}>
                      {beat ? '▲' : '▼'} {e.surprise_pct > 0 ? '+' : ''}{e.surprise_pct.toFixed(1)}%
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Historical financials table ────────────────────────────────────────
function FinancialsTable({ data }) {
  if (!data?.length) return (
    <div className="text-center py-12 text-gray-600 text-sm">No historical data available</div>
  )
  const sorted = [...data].sort((a, b) => String(a.period).localeCompare(String(b.period)))
  const years = sorted.map(y => y.period)

  const rows = [
    { label: 'Revenue',         key: 'revenue',           fmt: v => fmtLarge(v) },
    { label: 'Gross Profit',    key: 'gross_profit',      fmt: v => fmtLarge(v) },
    { label: 'Operating Income',key: 'operating_income',  fmt: v => fmtLarge(v) },
    { label: 'Net Income',      key: 'net_income',        fmt: v => fmtLarge(v) },
    { label: 'EPS (Diluted)',   key: 'eps',               fmt: v => v != null ? `$${v.toFixed(2)}` : '—' },
    { label: 'Op. Cash Flow',   key: 'operating_cashflow',fmt: v => fmtLarge(v) },
    { label: 'CapEx',           key: 'capex',             fmt: v => fmtLarge(v) },
    { label: 'Free Cash Flow',  key: 'fcf',               fmt: v => fmtLarge(v) },
    { label: 'Gross Margin',    key: 'gross_margin',      fmt: v => v != null ? `${v.toFixed(1)}%` : '—' },
    { label: 'Operating Margin',key: 'operating_margin',  fmt: v => v != null ? `${v.toFixed(1)}%` : '—' },
    { label: 'Net Margin',      key: 'net_margin',        fmt: v => v != null ? `${v.toFixed(1)}%` : '—' },
    { label: 'FCF Margin',      key: 'fcf_margin',        fmt: v => v != null ? `${v.toFixed(1)}%` : '—' },
    { label: 'ROIC',            key: 'roic',              fmt: v => v != null ? `${v.toFixed(1)}%` : '—' },
    { label: 'Total Debt',      key: 'total_debt',        fmt: v => fmtLarge(v) },
    { label: 'Cash',            key: 'cash',              fmt: v => fmtLarge(v) },
    { label: 'Equity',          key: 'equity',            fmt: v => fmtLarge(v) },
    { label: 'Current Ratio',   key: 'current_ratio_hist',fmt: v => v != null ? `${v.toFixed(2)}x` : '—' },
    { label: 'Shares (M)',      key: 'shares',            fmt: v => v != null ? `${v.toFixed(0)}M` : '—' },
  ]

  const colorForMetric = (key, val) => {
    if (val == null) return 'text-gray-600'
    if (['gross_margin','operating_margin','net_margin','fcf_margin','roic'].includes(key))
      return val > 0 ? 'text-emerald-400' : 'text-red-400'
    if (['revenue','gross_profit','operating_income','net_income','fcf','operating_cashflow'].includes(key))
      return val > 0 ? 'text-gray-200' : 'text-red-400'
    return 'text-gray-200'
  }

  return (
    <div className="overflow-auto rounded-xl border border-gray-800">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-800/80">
            <th className="px-4 py-2.5 text-left text-gray-500 font-medium sticky left-0 bg-gray-800/80 min-w-[140px]">Metric</th>
            {sorted.map(y => (
              <th key={y.period} className="px-4 py-2.5 text-right text-gray-400 font-mono font-normal">{y.period}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={row.key} className={`border-t border-gray-800/50 ${ri % 2 === 0 ? '' : 'bg-gray-800/20'}`}>
              <td className="px-4 py-2 text-gray-500 sticky left-0 bg-inherit font-medium">{row.label}</td>
              {sorted.map(y => (
                <td key={y.period} className={`px-4 py-2 text-right font-mono ${colorForMetric(row.key, y[row.key])}`}>
                  {y[row.key] != null ? row.fmt(y[row.key]) : <span className="text-gray-700">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Compact sentiment summary card ────────────────────────────────────
const SCORE_COLOR = score =>
  score >= 7 ? 'text-emerald-400' : score >= 5 ? 'text-yellow-400' : 'text-red-400'
const SCORE_BG = score =>
  score >= 7 ? 'border-emerald-800/40 bg-emerald-950/20' : score >= 5 ? 'border-yellow-800/40 bg-yellow-950/20' : 'border-red-800/40 bg-red-950/20'

function SentimentCard({ data, loading, error, onViewFull, onRetry }) {
  if (loading) return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3 flex items-center gap-3">
      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
      <span className="text-xs text-gray-500">Analyzing live news sentiment…</span>
    </div>
  )
  if (error) return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3 flex items-center justify-between gap-3">
      <span className="text-xs text-gray-500">Sentiment: {error}</span>
      <button onClick={onRetry} className="text-xs text-blue-400 hover:text-blue-300 shrink-0">Retry</button>
    </div>
  )
  if (!data?.analysis) return null
  const a     = data.analysis
  const score = a.sentiment_score ?? 5
  const tone  = { euphoric: '🚀', optimistic: '📈', cautious: '⚖️', fearful: '😰', panic: '🔴' }[a.investor_tone] ?? '📊'
  return (
    <div className={`border rounded-xl px-5 py-3.5 flex items-start gap-4 flex-wrap ${SCORE_BG(score)}`}>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`text-2xl font-bold font-mono ${SCORE_COLOR(score)}`}>{score}<span className="text-sm text-gray-500">/10</span></span>
        <div>
          <div className={`text-sm font-semibold ${SCORE_COLOR(score)}`}>{a.sentiment_label}</div>
          <div className="text-xs text-gray-500 capitalize">{tone} {a.investor_tone} tone</div>
        </div>
      </div>
      <div className="flex-1 min-w-[180px]">
        {a.one_line_summary && (
          <p className="text-sm text-gray-300 italic leading-snug">"{a.one_line_summary}"</p>
        )}
        {a.what_is_driving_the_stock?.[0] && (
          <p className="text-xs text-gray-500 mt-1">▸ {a.what_is_driving_the_stock[0]}</p>
        )}
      </div>
      <button onClick={onViewFull} className="text-xs text-blue-400 hover:text-blue-300 shrink-0 self-center">
        Full analysis →
      </button>
    </div>
  )
}

export default function StockDetail({ ticker, onBack }) {
  const [stock, setStock] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [chartTab, setChartTab] = useState('price')
  const [sectionTab, setSectionTab] = useState('overview')
  const [finMode, setFinMode] = useState('annual')
  const [refreshing, setRefreshing] = useState(false)
  const [sentimentData, setSentimentData] = useState(null)
  const [sentimentLoading, setSentimentLoading] = useState(true)
  const [sentimentError, setSentimentError] = useState(null)

  const fetchSentiment = (t) => {
    setSentimentData(null); setSentimentError(null); setSentimentLoading(true)
    api.getSentiment(t)
      .then(setSentimentData)
      .catch(e => setSentimentError(e.message || 'Failed to load sentiment'))
      .finally(() => setSentimentLoading(false))
  }

  const loadStock = (bust = false) => {
    setLoading(!bust); setRefreshing(bust); setError(null)
    const doFetch = () => api.getStock(ticker).then(setStock).catch(e => setError(e.message)).finally(() => { setLoading(false); setRefreshing(false) })
    if (bust) {
      api.clearTickerCache(ticker).finally(doFetch)
    } else {
      doFetch()
    }
  }

  useEffect(() => {
    setStock(null); setSentimentData(null)
    loadStock(false)
    fetchSentiment(ticker)
  }, [ticker])

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-400 text-sm">Loading {ticker}…</p>
    </div>
  )

  if (error) return (
    <div className="text-center py-16">
      <p className="text-red-400 text-sm mb-4">Error loading {ticker}: {error}</p>
      <button onClick={onBack} className="text-blue-400 text-sm hover:underline">← Back to screener</button>
    </div>
  )

  if (!stock) return null

  const annual = stock.financial_history?.annual ?? []

  // Net Debt / EBITDA from financial history (most recent year)
  const latestAnnual = [...annual].sort((a, b) => String(b.period).localeCompare(String(a.period)))[0]
  const netDebtEbitda = latestAnnual?.ebitda && stock.net_debt != null
    ? (stock.net_debt / latestAnnual.ebitda).toFixed(2)
    : null

  return (
    <div className="space-y-6">
      {/* Breadcrumb + refresh */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Screener
        </button>
        <button
          onClick={() => loadStock(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
          title="Clear cache and reload fresh data"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          {stock?._cached_age != null
            ? `Data ${Math.round(stock._cached_age / 60)}m old · Refresh`
            : 'Refresh'}
        </button>
      </div>

      {/* Header */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-white">{stock.symbol}</h1>
              <span className="text-gray-400 text-lg">{stock.name}</span>
              {stock.website && (
                <a href={stock.website} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 flex-wrap">
              <span className="bg-gray-800 px-2 py-0.5 rounded">{stock.sector}</span>
              <span>·</span>
              <span>{stock.industry}</span>
              {stock.employees && <><span>·</span><span>{stock.employees.toLocaleString()} employees</span></>}
            </div>
          </div>

          <div className="text-right">
            <div className="text-4xl font-mono font-bold text-white">
              ${stock.price?.toFixed(2)}
            </div>
            {stock.regular_market_change != null && (
              <div className={`text-sm font-mono mt-0.5 ${stock.regular_market_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stock.regular_market_change >= 0 ? '+' : ''}{stock.regular_market_change?.toFixed(2)}{' '}
                ({stock.regular_market_change_pct != null
                  ? `${stock.regular_market_change_pct >= 0 ? '+' : ''}${(stock.regular_market_change_pct * 100).toFixed(2)}%`
                  : ''})
              </div>
            )}
            {(stock.post_market_price || stock.pre_market_price) && (() => {
              const isPost = !!stock.post_market_price
              const exPrice  = isPost ? stock.post_market_price  : stock.pre_market_price
              const exChange = isPost ? stock.post_market_change  : stock.pre_market_change
              const exPct    = isPost ? stock.post_market_change_pct : stock.pre_market_change_pct
              const label    = isPost ? 'After Hours' : 'Pre-Market'
              const color    = exChange == null ? 'text-gray-400' : exChange >= 0 ? 'text-emerald-300' : 'text-red-300'
              return (
                <div className="mt-1.5 bg-gray-800/80 border border-gray-700 rounded-lg px-2.5 py-1.5 text-right">
                  <div className="text-xs text-gray-500 mb-0.5">{label}</div>
                  <div className={`font-mono text-sm font-semibold ${color}`}>
                    ${exPrice?.toFixed(2)}
                    {exChange != null && (
                      <span className="ml-1.5 text-xs font-normal">
                        {exChange >= 0 ? '+' : ''}{exChange?.toFixed(2)}
                        {exPct != null && ` (${exPct >= 0 ? '+' : ''}${(exPct * 100).toFixed(2)}%)`}
                      </span>
                    )}
                  </div>
                </div>
              )
            })()}
            <div className="text-sm text-gray-500 mt-1">
              Mkt Cap {fmtLarge(stock.market_cap)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              52W: ${stock.fifty_two_week_low?.toFixed(2)} – ${stock.fifty_two_week_high?.toFixed(2)}
            </div>
          </div>
        </div>

        {stock.description && (
          <p className="mt-4 text-gray-400 text-sm leading-relaxed line-clamp-3">
            {stock.description}
          </p>
        )}
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* Valuation */}
        <MetricTile label="Price to Earnings (TTM)"   value={fmt(stock.pe_ratio)}                         color={colorForPE(stock.pe_ratio, stock.sector)} />
        <MetricTile label="Forward Price to Earnings" value={fmt(stock.forward_pe)}                       color={colorForPE(stock.forward_pe, stock.sector)} />
        <MetricTile label="Price to Free Cash Flow"   value={fmt(stock.p_fcf)}                            color={colorForPE(stock.p_fcf, stock.sector)} />
        <MetricTile label="Price to Sales (TTM)"      value={fmt(stock.price_to_sales, { decimals: 2 })}  color={stock.price_to_sales != null ? (stock.price_to_sales < 5 ? 'text-emerald-400' : stock.price_to_sales < 15 ? 'text-yellow-400' : 'text-red-400') : 'text-gray-400'} />
        <MetricTile label="Enterprise Value / EBITDA" value={fmt(stock.ev_ebitda)}                        color={colorForPE(stock.ev_ebitda, stock.sector)} />
        <MetricTile label="Price to Book Value"       value={fmt(stock.price_to_book, { decimals: 2 })}   color={stock.price_to_book != null ? (stock.price_to_book < 3 ? 'text-emerald-400' : 'text-yellow-400') : 'text-gray-400'} />
        <MetricTile label="PEG Ratio"                 value={fmt(stock.peg_ratio, { decimals: 2 })}       color={stock.peg_ratio != null ? (stock.peg_ratio < 1 ? 'text-emerald-400' : stock.peg_ratio < 2 ? 'text-yellow-400' : 'text-red-400') : 'text-gray-400'}
                                                      sub="P/E ÷ Growth — < 1 is undervalued" />
        {/* Profitability */}
        <MetricTile label="Free Cash Flow (TTM)"      value={fmtLarge(stock.fcf_ttm)}                    color={stock.fcf_ttm != null ? (stock.fcf_ttm > 0 ? 'text-emerald-400' : 'text-red-400') : 'text-gray-400'} />
        <MetricTile label="FCF per Share"             value={stock.fcf_per_share != null ? `$${stock.fcf_per_share.toFixed(2)}` : '—'} color="text-emerald-400" />
        <MetricTile label="Net Profit Margin"         value={fmt(stock.profit_margin, { pct: true })}     color={colorForGrowth(stock.profit_margin)} />
        <MetricTile label="Operating Margin"          value={fmt(stock.operating_margin, { pct: true })}  color={colorForGrowth(stock.operating_margin)} />
        <MetricTile label="Return on Invested Capital"
          value={stock.roic != null ? `${stock.roic.toFixed(1)}%` : '—'}
          color={stock.roic == null ? 'text-gray-500' : stock.roic >= 15 ? 'text-emerald-400' : stock.roic >= 10 ? 'text-yellow-400' : 'text-red-400'} />
        <MetricTile label="Return on Equity"          value={fmt(stock.return_on_equity, { pct: true })}  color={colorForGrowth(stock.return_on_equity)} />
        {/* Growth */}
        <MetricTile label="Revenue Growth (YoY)"      value={fmt(stock.revenue_growth, { pct: true })}    color={colorForGrowth(stock.revenue_growth)} />
        <MetricTile label="Revenue CAGR (hist.)"
          value={stock.revenue_cagr != null ? `${stock.revenue_cagr > 0 ? '+' : ''}${stock.revenue_cagr.toFixed(1)}%` : '—'}
          color={stock.revenue_cagr != null ? (stock.revenue_cagr > 5 ? 'text-emerald-400' : stock.revenue_cagr > 0 ? 'text-yellow-400' : 'text-red-400') : 'text-gray-400'}
          sub="Annualized from historical data" />
        <MetricTile label="EPS CAGR (hist.)"
          value={stock.eps_cagr != null ? `${stock.eps_cagr > 0 ? '+' : ''}${stock.eps_cagr.toFixed(1)}%` : '—'}
          color={stock.eps_cagr != null ? (stock.eps_cagr > 5 ? 'text-emerald-400' : stock.eps_cagr > 0 ? 'text-yellow-400' : 'text-red-400') : 'text-gray-400'}
          sub="Annualized from historical data" />
        {/* Health & Capital Allocation */}
        <MetricTile label="Interest Coverage Ratio"
          value={stock.interest_coverage != null ? `${stock.interest_coverage.toFixed(1)}×` : '—'}
          color={stock.interest_coverage == null ? 'text-gray-500' : stock.interest_coverage >= 10 ? 'text-emerald-400' : stock.interest_coverage >= 5 ? 'text-yellow-400' : 'text-red-400'} />
        <MetricTile label="Net Debt / EBITDA"
          value={netDebtEbitda != null ? `${netDebtEbitda}×` : '—'}
          color={netDebtEbitda == null ? 'text-gray-500' : parseFloat(netDebtEbitda) < 0 ? 'text-emerald-400' : parseFloat(netDebtEbitda) < 2 ? 'text-yellow-400' : 'text-red-400'}
          sub={netDebtEbitda != null && parseFloat(netDebtEbitda) < 0 ? 'Net cash position' : undefined} />
        <MetricTile label="Debt to Equity"            value={stock.debt_to_equity != null ? fmt(stock.debt_to_equity, { decimals: 2 }) : '—'} color={colorForDE(stock.debt_to_equity)} />
        <MetricTile label="Current Ratio"             value={fmt(stock.current_ratio, { decimals: 2 })}   color={stock.current_ratio != null ? (stock.current_ratio >= 2 ? 'text-emerald-400' : 'text-yellow-400') : 'text-gray-400'} />
        <MetricTile label="Dividend Yield"            value={stock.dividend_yield != null ? `${(stock.dividend_yield * 100).toFixed(2)}%` : '—'} />
        <MetricTile label="Buyback Yield (est.)"
          value={stock.buyback_yield != null ? `${(stock.buyback_yield * 100).toFixed(2)}%` : '—'}
          color={stock.buyback_yield != null ? 'text-emerald-400' : 'text-gray-400'}
          sub="Annualized share reduction rate" />
        <MetricTile label="Total Shareholder Yield"
          value={stock.total_shareholder_yield != null ? `${(stock.total_shareholder_yield * 100).toFixed(2)}%` : '—'}
          color={stock.total_shareholder_yield != null ? (stock.total_shareholder_yield > 0.03 ? 'text-emerald-400' : 'text-yellow-400') : 'text-gray-400'}
          sub="Dividend + buybacks" />
        <MetricTile label="Beta (Market Sensitivity)"  value={fmt(stock.beta, { decimals: 2 })} />
      </div>

      {/* Inline sentiment summary */}
      <SentimentCard
        data={sentimentData}
        loading={sentimentLoading}
        error={sentimentError}
        onViewFull={() => setSectionTab('sentiment')}
        onRetry={() => fetchSentiment(ticker)}
      />

      {/* Section tabs */}
      <div className="flex gap-1 bg-gray-900 p-1 rounded-xl border border-gray-800 w-fit flex-wrap">
        {SECTION_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSectionTab(t.key)}
            className={`px-4 py-1.5 text-sm rounded-lg transition-colors font-medium ${
              sectionTab === t.key
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview section */}
      {sectionTab === 'overview' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex gap-1 mb-5 flex-wrap">
            {CHART_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setChartTab(t.key)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                  chartTab === t.key
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {chartTab === 'price'   && <PriceChart   data={stock.price_history} />}
          {chartTab === 'revenue' && <RevenueChart  data={annual} />}
          {chartTab === 'margins' && <MarginsChart  data={annual} />}
          {chartTab === 'fcf'     && <FCFChart      data={annual} />}
          {chartTab === 'debt'    && <DebtChart     data={annual} />}
          {chartTab === 'eps'     && <EPSChart      data={annual} />}
          {chartTab === 'roic'    && <ROICChart     data={annual} />}
          {chartTab === 'shares'  && <SharesChart   data={annual} />}
        </div>
      )}

      {/* Financials table section */}
      {sectionTab === 'history' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
          {/* EPS beat/miss strip */}
          <EarningsStrip earnings={stock.earnings_history} />

          {/* Annual / Quarterly toggle */}
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Financial History
            </div>
            <div className="flex gap-1 bg-gray-800 p-1 rounded-lg">
              {['annual', 'quarterly'].map(mode => (
                <button key={mode} onClick={() => setFinMode(mode)}
                  className={`px-3 py-1 text-xs rounded transition-colors font-medium capitalize ${
                    finMode === mode ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}>
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <FinancialsTable
            data={finMode === 'annual'
              ? annual
              : (stock.financial_history?.quarterly ?? [])}
          />
        </div>
      )}

      {/* DCF section */}
      {sectionTab === 'dcf' && (
        <DCFCalculator ticker={stock.symbol} currentPrice={stock.price} financialHistory={annual} />
      )}

      {/* Graham section */}
      {sectionTab === 'graham' && (
        <GrahamScore
          graham_score={stock.graham_score}
          graham_number={stock.graham_number}
          price={stock.price}
        />
      )}

      {/* AI Score */}
      {sectionTab === 'aiscore' && (
        <AIScore ticker={stock.symbol} currentPrice={stock.price} />
      )}

      {/* LLM Analysis */}
      {sectionTab === 'llm' && (
        <LLMAnalysis ticker={stock.symbol} />
      )}

      {/* Market & Investor Sentiment */}
      {sectionTab === 'sentiment' && (
        <SentimentAnalysis ticker={stock.symbol} initialData={sentimentData} initialLoading={sentimentLoading} initialError={sentimentError} />
      )}

    </div>
  )
}
