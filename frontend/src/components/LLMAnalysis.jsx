import { useState } from 'react'
import { api } from '../api.js'
import { Sparkles, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, AlertTriangle, Shield, BarChart2 } from 'lucide-react'

const VERDICT_STYLE = {
  BUY:   { color: 'text-emerald-400', bg: 'bg-emerald-950/60 border-emerald-800', icon: <TrendingUp  size={16} /> },
  HOLD:  { color: 'text-yellow-400',  bg: 'bg-yellow-950/60 border-yellow-800',  icon: <Minus       size={16} /> },
  AVOID: { color: 'text-red-400',     bg: 'bg-red-950/60 border-red-800',        icon: <TrendingDown size={16} /> },
}

const CONFIDENCE_COLOR = { HIGH: 'text-emerald-400', MEDIUM: 'text-yellow-400', LOW: 'text-red-400' }

function Section({ icon, title, children }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="bg-gray-800/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-800 transition-colors"
      >
        <span className="text-blue-400">{icon}</span>
        <span className="text-sm font-medium text-gray-200 flex-1">{title}</span>
        {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 text-sm text-gray-300 leading-relaxed">{children}</div>}
    </div>
  )
}

export default function LLMAnalysis({ ticker }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const run = async () => {
    setLoading(true); setError(null)
    try {
      const res = await api.getLLMAnalysis(ticker)
      setResult(res)
    } catch (e) {
      const msg = e.message || ''
      setError(
        msg.includes('ANTHROPIC_API_KEY') || msg.includes('401') || msg.includes('authentication')
          ? 'API key not configured. Add ANTHROPIC_API_KEY to backend/.env and restart the server.'
          : `Analysis failed: ${msg}`
      )
    } finally {
      setLoading(false)
    }
  }

  const a = result?.analysis

  const verdictStyle = a?.verdict ? VERDICT_STYLE[a.verdict] ?? VERDICT_STYLE.HOLD : null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles size={18} className="text-purple-400" />
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          AI Analysis — Graham Perspective
        </h3>
        <span className="ml-auto text-xs text-gray-600">Powered by Claude</span>
      </div>

      {!result && !loading && (
        <div className="text-center py-8">
          <Sparkles size={42} className="mx-auto mb-3 text-purple-400 opacity-40" />
          <p className="text-gray-400 text-sm mb-4">
            Get an AI-powered Graham value investing analysis of {ticker}
          </p>
          <button
            onClick={run}
            className="bg-purple-700 hover:bg-purple-600 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
          >
            Analyze with Claude
          </button>
          {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
        </div>
      )}

      {loading && (
        <div className="text-center py-10">
          <div className="inline-block w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400 text-sm">Analyzing {ticker} against Graham's principles…</p>
        </div>
      )}

      {a && (
        <div className="space-y-3">
          {/* Verdict banner */}
          {verdictStyle && (
            <div className={`flex items-center gap-3 rounded-xl border p-4 ${verdictStyle.bg}`}>
              <span className={verdictStyle.color}>{verdictStyle.icon}</span>
              <div className="flex-1">
                <div className={`text-xl font-bold ${verdictStyle.color}`}>{a.verdict}</div>
                <div className="text-sm text-gray-300 mt-0.5">{a.verdict_reasoning}</div>
              </div>
              {a.confidence && (
                <div className="text-right">
                  <div className="text-xs text-gray-500">Confidence</div>
                  <div className={`text-sm font-semibold ${CONFIDENCE_COLOR[a.confidence]}`}>{a.confidence}</div>
                </div>
              )}
            </div>
          )}

          {/* Sections */}
          <Section icon={<BarChart2 size={15} />} title="Business Overview">
            {a.business_overview}
          </Section>

          <Section icon={<Shield size={15} />} title="Competitive Moat">
            {a.competitive_moat}
          </Section>

          <Section icon={<TrendingUp size={15} />} title="Financial Strengths">
            <ul className="space-y-1 mt-1">
              {a.financial_strengths?.map((s, i) => (
                <li key={i} className="flex gap-2"><span className="text-emerald-400 mt-0.5">✓</span>{s}</li>
              ))}
            </ul>
          </Section>

          <Section icon={<AlertTriangle size={15} />} title="Financial Concerns">
            <ul className="space-y-1 mt-1">
              {a.financial_concerns?.map((s, i) => (
                <li key={i} className="flex gap-2"><span className="text-yellow-400 mt-0.5">!</span>{s}</li>
              ))}
            </ul>
          </Section>

          <Section icon={<Sparkles size={15} />} title="Graham Assessment">
            {a.graham_assessment}
          </Section>

          <Section icon={<BarChart2 size={15} />} title="Valuation Verdict">
            {a.valuation_verdict}
          </Section>

          <Section icon={<AlertTriangle size={15} />} title="Key Risks">
            <ul className="space-y-1 mt-1">
              {a.key_risks?.map((r, i) => (
                <li key={i} className="flex gap-2"><span className="text-red-400 mt-0.5">▲</span>{r}</li>
              ))}
            </ul>
          </Section>

          <button
            onClick={run}
            className="mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors underline"
          >
            Re-analyze
          </button>
        </div>
      )}
    </div>
  )
}
