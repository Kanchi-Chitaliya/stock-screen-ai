import { useState, useEffect } from 'react'
import { api } from '../api.js'
import { Sparkles, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react'

const VERDICT_COLOR = {
  'STRONG BUY': 'text-emerald-300 bg-emerald-950 border-emerald-700',
  'BUY':        'text-emerald-400 bg-emerald-950/60 border-emerald-800',
  'HOLD':       'text-yellow-400 bg-yellow-950/60 border-yellow-800',
  'REDUCE':     'text-orange-400 bg-orange-950/60 border-orange-800',
  'AVOID':      'text-red-400 bg-red-950/60 border-red-800',
}

const PILLAR_LABELS = {
  business_quality:                 { label: 'Business Quality',       max: 30, color: 'bg-blue-500' },
  financial_performance:            { label: 'Financial Performance',  max: 25, color: 'bg-purple-500' },
  growth_durability:                { label: 'Growth & Durability',    max: 20, color: 'bg-emerald-500' },
  balance_sheet_capital_allocation: { label: 'Balance Sheet & Capital',max: 15, color: 'bg-yellow-500' },
  valuation:                        { label: 'Valuation',              max: 10, color: 'bg-orange-500' },
}

function ScoreRing({ score }) {
  const pct = (score / 10) * 100
  const color = score >= 7 ? '#10b981' : score >= 5 ? '#f59e0b' : '#ef4444'
  const r = 36, circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#1f2937" strokeWidth="7" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="text-center">
        <div className="text-2xl font-bold font-mono" style={{ color }}>{score}</div>
        <div className="text-xs text-gray-500">/10</div>
      </div>
    </div>
  )
}

function PillarBar({ pillar, score, notes }) {
  const cfg = PILLAR_LABELS[pillar]
  if (!cfg) return null
  const pct = Math.min(100, (score / cfg.max) * 100)
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{cfg.label}</span>
        <span className="font-mono text-gray-300">{score}/{cfg.max}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${cfg.color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      {notes && <div className="text-xs text-gray-600 leading-relaxed">{notes}</div>}
    </div>
  )
}

export default function AIScore({ ticker, currentPrice }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [showMethodology, setShowMethodology] = useState(false)

  const run = async () => {
    setLoading(true); setError(null)
    try {
      const res = await api.getAIScore(ticker)
      setData(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { run() }, [ticker])

  const score  = data?.score
  const method = data?.methodology

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Sparkles size={18} className="text-violet-400 shrink-0" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">AI Investment Score</h3>
            {data?.mode && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                data.mode === 'claude'
                  ? 'text-violet-300 bg-violet-950/60 border-violet-800'
                  : 'text-gray-400 bg-gray-800 border-gray-700'
              }`}>
                {data.mode === 'claude' ? '✦ Claude' : '⚙ Algorithmic'}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            Quality-value assessment — moat, capital efficiency, growth, balance sheet, valuation.
          </p>
        </div>
      </div>

      {/* Methodology accordion */}
      <button onClick={() => setShowMethodology(v => !v)}
        className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-300 bg-gray-800/40 rounded-lg px-3 py-2 transition-colors">
        <span className="font-medium">How is this scored?</span>
        {showMethodology ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {showMethodology && method && (
        <div className="bg-gray-800/40 rounded-xl p-4 space-y-3 text-xs">
          <p className="text-gray-400 italic">{method.philosophy}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(method.pillars).map(([key, desc]) => {
              const cfg = PILLAR_LABELS[key]
              return cfg ? (
                <div key={key} className="flex gap-2">
                  <div className={`w-1 rounded-full ${cfg.color} shrink-0 mt-0.5`} />
                  <div>
                    <span className="text-gray-300 font-medium">{cfg.label}</span>
                    <span className="text-gray-600"> — {desc}</span>
                  </div>
                </div>
              ) : null
            })}
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
          <svg className="animate-spin h-4 w-4 text-violet-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Calculating score…
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Results */}
      {score && !score.error && (
        <div className="space-y-5">
          {/* Verdict + ring */}
          <div className="flex items-start gap-5">
            <ScoreRing score={score.total_score} />
            <div className="flex-1 space-y-2">
              <div className={`inline-flex items-center gap-2 text-sm font-bold px-3 py-1 rounded-lg border ${VERDICT_COLOR[score.verdict] ?? 'text-gray-300 bg-gray-800 border-gray-700'}`}>
                {score.verdict === 'STRONG BUY' || score.verdict === 'BUY' ? <TrendingUp size={14} /> :
                 score.verdict === 'AVOID' || score.verdict === 'REDUCE' ? <TrendingDown size={14} /> :
                 <Minus size={14} />}
                {score.verdict}
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">{score.verdict_reasoning}</p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Confidence:</span>
                <span className={`font-medium ${score.confidence === 'HIGH' ? 'text-emerald-400' : score.confidence === 'MEDIUM' ? 'text-yellow-400' : 'text-red-400'}`}>
                  {score.confidence}
                </span>
                {score.confidence_reason && <span className="text-gray-600">— {score.confidence_reason}</span>}
              </div>
            </div>
          </div>

          {/* Pillar scores */}
          <div className="space-y-4">
            {Object.entries(score.pillar_scores ?? {}).map(([pillar, val]) => (
              <PillarBar key={pillar} pillar={pillar} score={val} notes={score.pillar_notes?.[pillar]} />
            ))}
          </div>

          {/* Fair value range */}
          {score.fair_value_range && (
            <div className="bg-gray-800/50 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fair Value Estimate</span>
                {score.fair_value_range.methods_used?.length > 0 && (
                  <span className="text-[10px] text-gray-600 font-mono">
                    {score.fair_value_range.methods_used.join(' · ')}
                  </span>
                )}
              </div>
              {/* Midpoint prominent, range below */}
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-mono font-bold text-blue-300">
                  ${score.fair_value_range.mid?.toLocaleString()}
                </span>
                <span className="text-sm font-mono text-gray-500">
                  ${score.fair_value_range.low?.toLocaleString()} – ${score.fair_value_range.high?.toLocaleString()}
                </span>
              </div>
              {/* Upside / downside vs current price */}
              {currentPrice && score.fair_value_range.mid && (() => {
                const upside = ((score.fair_value_range.mid / currentPrice) - 1) * 100
                const inRange = currentPrice >= score.fair_value_range.low && currentPrice <= score.fair_value_range.high
                return (
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                      inRange
                        ? 'text-yellow-400 bg-yellow-950/60 border-yellow-800'
                        : upside > 0
                        ? 'text-emerald-400 bg-emerald-950/60 border-emerald-800'
                        : 'text-red-400 bg-red-950/60 border-red-800'
                    }`}>
                      {inRange ? 'Within fair range' : upside > 0 ? `${upside.toFixed(0)}% upside` : `${Math.abs(upside).toFixed(0)}% above fair value`}
                    </span>
                  </div>
                )
              })()}
              {score.fair_value_basis && (
                <p className="text-xs text-gray-600">{score.fair_value_basis}</p>
              )}
            </div>
          )}

          {/* Bull & Bear thesis */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 mb-2">
                <TrendingUp size={12} /> Bull Thesis
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">{score.bull_thesis}</p>
            </div>
            <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400 mb-2">
                <TrendingDown size={12} /> Bear Thesis
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">{score.bear_thesis}</p>
            </div>
          </div>

          {/* Conviction factors */}
          {score.key_conviction_factors?.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Key Conviction Factors</div>
              <ul className="space-y-1.5">
                {score.key_conviction_factors.map((f, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-300">
                    <span className="text-violet-500 mt-0.5">◆</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Re-run */}
          <button onClick={run} disabled={loading}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40">
            {loading ? 'Refreshing…' : '↺ Refresh'}
          </button>
        </div>
      )}

      {score?.error && (
        <div className="text-xs text-red-400 bg-red-950/30 rounded-lg p-3">
          {score.raw_response || 'Analysis failed — try again.'}
        </div>
      )}
    </div>
  )
}
