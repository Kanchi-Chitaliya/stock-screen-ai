import { useState, useCallback, useMemo } from 'react'
import { api, fmtLarge } from '../api.js'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { Calculator } from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────────────
function avg(arr) {
  const valid = arr.filter(v => v != null && !isNaN(v))
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null
}

function pctStr(v) {
  if (v == null || isNaN(v)) return null
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

function computeBenchmarks(annual) {
  if (!annual?.length) return {}
  const sorted = [...annual].sort((a, b) => String(a.period).localeCompare(String(b.period)))

  const revGrowths = []
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i - 1].revenue, c = sorted[i].revenue
    if (p && c && p > 0) revGrowths.push((c - p) / p * 100)
  }
  const fcfMargins = sorted.map(y => y.fcf_margin).filter(v => v != null)
  const opMargins  = sorted.map(y => y.operating_margin).filter(v => v != null)

  return {
    revGrowth: {
      '1yr': revGrowths.at(-1) ?? null,
      '3yr': avg(revGrowths.slice(-3)),
      '5yr': avg(revGrowths.slice(-5)),
    },
    fcfMargin: {
      '1yr': fcfMargins.at(-1) ?? null,
      '3yr': avg(fcfMargins.slice(-3)),
      '5yr': avg(fcfMargins.slice(-5)),
    },
    opMargin: {
      '1yr': opMargins.at(-1) ?? null,
      '3yr': avg(opMargins.slice(-3)),
    },
    // Raw series for auto-fill intelligence
    revGrowthArr: revGrowths,
    fcfMarginArr: fcfMargins,
  }
}

const PRESETS = {
  bull: { revenue_growth_1_5: 18, revenue_growth_6_10: 12, fcf_margin: 20, terminal_growth_rate: 4, discount_rate: 9,  margin_of_safety: 15 },
  base: { revenue_growth_1_5: 10, revenue_growth_6_10:  7, fcf_margin: 15, terminal_growth_rate: 3, discount_rate: 10, margin_of_safety: 25 },
  bear: { revenue_growth_1_5:  4, revenue_growth_6_10:  3, fcf_margin: 10, terminal_growth_rate: 2, discount_rate: 12, margin_of_safety: 40 },
}

// ── Assumption row ─────────────────────────────────────────────────────
function AssumptionRow({ label, description, value, min, max, step = 0.5, onChange, benchmarks }) {
  return (
    <div className="bg-gray-800/40 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-medium text-gray-200">{label}</div>
          {description && <div className="text-xs text-gray-600 mt-0.5">{description}</div>}
        </div>
        {benchmarks && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-600">Historical:</span>
            {Object.entries(benchmarks).map(([period, val]) =>
              val != null ? (
                <button
                  key={period}
                  onClick={() => onChange(parseFloat(val.toFixed(1)))}
                  title={`Apply ${period} historical average`}
                  className="flex items-center gap-1 bg-gray-700/60 hover:bg-blue-900/60 border border-gray-600 hover:border-blue-600 text-xs rounded-md px-2 py-1 transition-colors"
                >
                  <span className="text-gray-500">{period}</span>
                  <span className="font-mono text-emerald-400">{pctStr(val)}</span>
                </button>
              ) : null
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range" min={min} max={max} step={step} value={Math.min(Math.max(value, min), max)}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="flex-1 accent-blue-500 cursor-pointer h-1.5"
        />
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number" min={min} max={max} step={step} value={value}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            className="w-16 bg-gray-900 border border-gray-600 text-blue-300 font-mono text-sm rounded px-2 py-1 text-right focus:outline-none focus:border-blue-500"
          />
          <span className="text-xs text-gray-500">%</span>
        </div>
      </div>
      <div className="flex justify-between text-xs text-gray-700">
        <span>{min}%</span><span>{max}%</span>
      </div>
    </div>
  )
}

function ResultTile({ label, value, sub, color, large }) {
  return (
    <div className="bg-gray-800/60 rounded-xl px-4 py-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`font-mono font-bold ${large ? 'text-2xl' : 'text-lg'} ${color ?? 'text-gray-100'}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  )
}

// Auto-scale PV values to readable units (M or B)
function pvUnit(maxPv) {
  return maxPv >= 1000 ? { divisor: 1000, label: 'B' } : { divisor: 1, label: 'M' }
}

// ── Sensitivity table ──────────────────────────────────────────────────
function SensitivityTable({ sensitivity, currentPrice, baseWACC, baseTGR }) {
  if (!sensitivity) return null
  const { wacc_labels, tgr_labels, values } = sensitivity
  const baseWACCLabel = `${Math.round(baseWACC)}%`
  const baseTGRLabel  = `${Math.round(baseTGR)}%`

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Sensitivity — Intrinsic Value (WACC × Terminal Growth)
      </div>
      <div className="overflow-auto rounded-lg border border-gray-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-800/80">
              <th className="px-3 py-2 text-gray-500 text-left font-normal">WACC ↓ / TGR →</th>
              {tgr_labels.map(t => (
                <th key={t} className={`px-3 py-2 font-mono text-center ${t === baseTGRLabel ? 'text-blue-400' : 'text-gray-400'}`}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {values.map((row, ri) => (
              <tr key={ri} className={`border-t border-gray-700/50 ${wacc_labels[ri] === baseWACCLabel ? 'bg-blue-950/20' : ''}`}>
                <td className={`px-3 py-1.5 font-mono ${wacc_labels[ri] === baseWACCLabel ? 'text-blue-400' : 'text-gray-500'}`}>
                  {wacc_labels[ri]}
                </td>
                {row.map((val, ci) => {
                  const isBase = wacc_labels[ri] === baseWACCLabel && tgr_labels[ci] === baseTGRLabel
                  const color = val == null ? 'text-gray-700'
                    : val > (currentPrice ?? 0) * 1.15 ? 'text-emerald-400'
                    : val > (currentPrice ?? 0) ? 'text-yellow-400'
                    : 'text-red-400'
                  return (
                    <td key={ci} className={`px-3 py-1.5 font-mono text-center ${color} ${isBase ? 'ring-1 ring-inset ring-blue-500 rounded' : ''}`}>
                      {val != null ? `$${val.toLocaleString()}` : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-4 text-xs text-gray-600">
        <span><span className="text-emerald-400">■</span> &gt;15% above price</span>
        <span><span className="text-yellow-400">■</span> above price</span>
        <span><span className="text-red-400">■</span> below price</span>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────
export default function DCFCalculator({ ticker, currentPrice, financialHistory }) {
  const [params, setParams] = useState(PRESETS.base)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const annual = financialHistory ?? []
  const bm = useMemo(() => computeBenchmarks(annual), [annual])

  const set = (key, val) => { setParams(p => ({ ...p, [key]: val })); setResult(null) }

  const run = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await api.calculateDCF(ticker, params)
      if (res.error) setError(res.error)
      else setResult(res)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [ticker, params])

  // Use smart presets from backend if available, otherwise fall back to generic
  const smartPresets = result?.smart_presets
  const applyPreset = (name) => {
    const p = smartPresets?.[name] ?? PRESETS[name]
    setParams(p); setResult(null)
  }

  const fillFromHistory = () => {
    const next = { ...params }
    const revGrowths = bm.revGrowthArr ?? []
    // Y1-5: use 3yr avg; Y6-10: use 5yr avg (longer-run trend) if available, else 60% of Y1-5
    if (bm.revGrowth?.['3yr'] != null) {
      next.revenue_growth_1_5 = parseFloat(Math.max(0, bm.revGrowth['3yr']).toFixed(1))
    }
    const longRunGrowth = bm.revGrowth?.['5yr'] ?? (bm.revGrowth?.['3yr'] != null ? bm.revGrowth['3yr'] * 0.6 : null)
    if (longRunGrowth != null) {
      next.revenue_growth_6_10 = parseFloat(Math.max(0, longRunGrowth * 0.7).toFixed(1))
    }
    if (bm.fcfMargin?.['3yr'] != null) {
      next.fcf_margin = parseFloat(Math.max(1, bm.fcfMargin['3yr']).toFixed(1))
    }
    setParams(next); setResult(null)
  }

  const hasHistory = bm.revGrowth?.['3yr'] != null || bm.fcfMargin?.['3yr'] != null

  const upside = result?.upside_to_intrinsic
  const upsideColor = upside == null ? 'text-gray-400' : upside > 15 ? 'text-emerald-400' : upside > 0 ? 'text-yellow-400' : 'text-red-400'

  const chartData = [
    ...(result?.yearly_projections?.map(y => ({
      label: `Y${y.year}`, pv: Math.round(y.pv / 1e6), isTerminal: false,
    })) ?? []),
    ...(result ? [{ label: 'Terminal', pv: Math.round(result.terminal_pv / 1e6), isTerminal: true }] : []),
  ]
  const maxPv = chartData.length ? Math.max(...chartData.map(d => d.pv)) : 0
  const { divisor, label: pvLabel } = pvUnit(maxPv)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
      {/* Header + presets */}
      <div className="flex items-center gap-3 flex-wrap">
        <Calculator size={18} className="text-blue-400 shrink-0" />
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          DCF Intrinsic Value Calculator
        </h3>
        <div className="ml-auto flex gap-2 flex-wrap">
          {hasHistory && (
            <button onClick={fillFromHistory}
              className="px-3 py-1 text-xs rounded border border-emerald-700 bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/60 transition-colors font-medium">
              ↺ Fill from History
            </button>
          )}
          {Object.keys(PRESETS).map(s => (
            <button key={s} onClick={() => applyPreset(s)}
              className={`px-3 py-1 text-xs rounded border transition-colors ${
                JSON.stringify(params) === JSON.stringify(PRESETS[s])
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
              }`}>
              {s === 'bull' ? '🐂 Bull' : s === 'base' ? 'Base' : '🐻 Bear'}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-600">
        Each row shows <span className="text-gray-400">historical actuals</span> (click to apply as assumption) alongside your forward estimate.
        Revenue → FCF Margin → discounted cash flows → intrinsic value.
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* ── Left: Assumptions ──────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Growth &amp; Profitability Assumptions
          </div>

          <AssumptionRow
            label="Revenue Growth — Years 1–5"
            description="Your near-term revenue growth forecast"
            value={params.revenue_growth_1_5}
            min={-5} max={50}
            onChange={v => set('revenue_growth_1_5', v)}
            benchmarks={bm.revGrowth}
          />

          <AssumptionRow
            label="Revenue Growth — Years 6–10"
            description="Long-run growth as the business matures"
            value={params.revenue_growth_6_10}
            min={-5} max={30}
            onChange={v => set('revenue_growth_6_10', v)}
            benchmarks={{ '5yr': bm.revGrowth?.['5yr'] }}
          />

          <AssumptionRow
            label="Free Cash Flow Margin"
            description="FCF ÷ Revenue — what fraction of revenue becomes real cash"
            value={params.fcf_margin}
            min={1} max={80}
            onChange={v => set('fcf_margin', v)}
            benchmarks={bm.fcfMargin}
          />

          <div className="text-xs text-gray-700 bg-gray-800/30 rounded-lg px-3 py-2 leading-relaxed">
            <span className="text-gray-500 font-medium">Operating Margin (ref):</span>{' '}
            {bm.opMargin?.['1yr'] != null ? `1yr ${pctStr(bm.opMargin['1yr'])}` : '—'}
            {bm.opMargin?.['3yr'] != null ? ` · 3yr avg ${pctStr(bm.opMargin['3yr'])}` : ''}
            <span className="ml-2 text-gray-700">— FCF Margin is typically lower due to CapEx &amp; working capital.</span>
          </div>
        </div>

        {/* ── Right: Macro assumptions + results ────────────────────── */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Valuation Parameters
          </div>

          <AssumptionRow
            label="Terminal Growth Rate"
            description="Perpetual growth after year 10 (typically 2–4%, close to GDP)"
            value={params.terminal_growth_rate}
            min={0} max={5} step={0.25}
            onChange={v => set('terminal_growth_rate', v)}
          />

          <AssumptionRow
            label="Discount Rate (WACC)"
            description="Required annual return — higher = more conservative valuation"
            value={params.discount_rate}
            min={5} max={20}
            onChange={v => set('discount_rate', v)}
          />

          <AssumptionRow
            label="Margin of Safety"
            description="Discount below intrinsic value to protect against estimate error"
            value={params.margin_of_safety}
            min={0} max={60}
            onChange={v => set('margin_of_safety', v)}
          />

          <button onClick={run} disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm mt-1">
            {loading ? 'Calculating…' : 'Calculate Intrinsic Value'}
          </button>
          {error && <p className="text-red-400 text-xs">{error}</p>}

          {/* Results */}
          {result && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <ResultTile label="Intrinsic Value" value={`$${result.intrinsic_value_per_share?.toFixed(2)}`} color="text-blue-300" large />
                <ResultTile label={`Safety Price (−${params.margin_of_safety}%)`} value={`$${result.margin_of_safety_price?.toFixed(2)}`} sub="Buy below this price" />
                <ResultTile label="Current Price" value={`$${currentPrice?.toFixed(2) ?? '—'}`} />
                <ResultTile label="Upside to Intrinsic"
                  value={upside != null ? `${upside > 0 ? '+' : ''}${upside?.toFixed(1)}%` : '—'}
                  color={upsideColor} />
              </div>

              {/* Value bridge */}
              <div className="bg-gray-800/50 rounded-lg p-3 text-xs space-y-1.5 text-gray-400">
                <div className="text-gray-500 font-medium mb-1">Equity Value Bridge</div>
                <div className="flex justify-between"><span>PV of 10-yr Free Cash Flows</span><span className="font-mono text-gray-200">{fmtLarge(result.pv_of_fcfs)}</span></div>
                <div className="flex justify-between"><span>+ Terminal Value (PV)</span><span className="font-mono text-yellow-400">{fmtLarge(result.terminal_pv)}</span></div>
                <div className="flex justify-between border-t border-gray-700 pt-1"><span>= Enterprise Value</span><span className="font-mono text-gray-200">{fmtLarge(result.pv_of_fcfs + result.terminal_pv)}</span></div>
                <div className="flex justify-between">
                  <span>{result.net_debt >= 0 ? '− Net Debt' : '+ Net Cash'}</span>
                  <span className={`font-mono ${result.net_debt >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {result.net_debt != null ? fmtLarge(Math.abs(result.net_debt)) : '—'}
                  </span>
                </div>
                <div className="flex justify-between border-t border-gray-700 pt-1">
                  <span>= Equity Value</span>
                  <span className="font-mono text-gray-200">{fmtLarge(result.total_equity_value)}</span>
                </div>
                <div className="flex justify-between">
                  <span>÷ Shares Outstanding</span>
                  <span className="font-mono text-gray-200">{result.shares_used ? `${(result.shares_used / 1e6).toFixed(0)}M` : '—'}</span>
                </div>
                <div className="flex justify-between border-t border-gray-700 pt-1 font-semibold">
                  <span className="text-gray-200">= Intrinsic Value / Share</span>
                  <span className="font-mono text-blue-300">${result.intrinsic_value_per_share?.toFixed(2)}</span>
                </div>
              </div>

              {chartData.length > 0 && (
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={chartData.map(d => ({ ...d, pvScaled: +(d.pv / divisor).toFixed(1) }))}
                    margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#1f2937" />
                    <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 9 }} tickLine={false} />
                    <YAxis tickFormatter={v => `$${v}${pvLabel}`} tick={{ fill: '#6b7280', fontSize: 9 }} tickLine={false} width={56} />
                    <Tooltip formatter={v => [`$${v?.toLocaleString()}${pvLabel}`, 'Present Value']}
                      contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 11 }} />
                    <Bar dataKey="pvScaled" radius={[3, 3, 0, 0]}>
                      {chartData.map((e, i) => <Cell key={i} fill={e.isTerminal ? '#f59e0b' : '#3b82f6'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}

              {/* Forward price projections */}
              {result.forward_prices && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Expected Intrinsic Value — If Assumptions Hold
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 5, 10].map(yr => {
                      const fv = result.forward_prices[yr]
                      const proj = result.yearly_projections?.[yr - 1]
                      const upPct = fv && currentPrice ? ((fv / currentPrice) - 1) * 100 : null
                      const color = upPct == null ? 'text-gray-400' : upPct > 15 ? 'text-emerald-400' : upPct > 0 ? 'text-yellow-400' : 'text-red-400'
                      return (
                        <div key={yr} className="bg-gray-800 rounded-lg p-3 text-center space-y-1">
                          <div className="text-xs text-gray-500">Year {yr}</div>
                          <div className={`font-mono text-base font-bold ${color}`}>
                            {fv != null ? `$${fv.toLocaleString()}` : '—'}
                          </div>
                          {upPct != null && (
                            <div className={`text-xs ${color}`}>
                              {upPct > 0 ? '+' : ''}{upPct.toFixed(0)}% from today
                            </div>
                          )}
                          <div className="border-t border-gray-700 pt-1 mt-1">
                            <div className="font-mono text-xs text-blue-300">{fmtLarge(proj?.revenue)}</div>
                            <div className="text-xs text-gray-600">rev</div>
                            <div className="font-mono text-xs text-emerald-400">{fmtLarge(proj?.fcf)}</div>
                            <div className="text-xs text-gray-600">FCF</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {result.share_cagr_pct !== 0 && (
                    <div className="text-xs text-gray-600">
                      Share count projected at {result.share_cagr_pct > 0 ? '+' : ''}{result.share_cagr_pct?.toFixed(2)}%/yr
                      (historical {result.share_cagr_pct < 0 ? 'buyback' : 'dilution'} rate applied)
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sensitivity table — full width below the two-column section */}
      {result?.sensitivity && (
        <SensitivityTable
          sensitivity={result.sensitivity}
          currentPrice={currentPrice}
          baseWACC={params.discount_rate}
          baseTGR={params.terminal_growth_rate}
        />
      )}
    </div>
  )
}
