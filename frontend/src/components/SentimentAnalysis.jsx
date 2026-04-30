import { useState, useEffect } from 'react'
import { api } from '../api.js'
import { TrendingUp, TrendingDown, Minus, ExternalLink, RefreshCw, Newspaper } from 'lucide-react'

const SCORE_CONFIG = [
  { max: 2,  label: 'Very Bearish', color: 'text-red-500',     bar: 'bg-red-600'     },
  { max: 4,  label: 'Bearish',      color: 'text-red-400',     bar: 'bg-red-500'     },
  { max: 6,  label: 'Neutral',      color: 'text-yellow-400',  bar: 'bg-yellow-500'  },
  { max: 8,  label: 'Bullish',      color: 'text-emerald-400', bar: 'bg-emerald-500' },
  { max: 10, label: 'Very Bullish', color: 'text-emerald-400', bar: 'bg-emerald-400' },
]

const TONE_CONFIG = {
  euphoric:   { emoji: '🚀', color: 'text-emerald-300', bg: 'bg-emerald-950/40 border-emerald-700/40' },
  optimistic: { emoji: '📈', color: 'text-emerald-400', bg: 'bg-emerald-950/30 border-emerald-800/40' },
  cautious:   { emoji: '⚖️', color: 'text-yellow-400',  bg: 'bg-yellow-950/30 border-yellow-800/40'  },
  fearful:    { emoji: '😰', color: 'text-red-300',     bg: 'bg-red-950/30 border-red-800/40'        },
  panic:      { emoji: '🔴', color: 'text-red-400',     bg: 'bg-red-950/40 border-red-700/40'        },
}

const SENT_COLORS = {
  bullish: { text: 'text-emerald-400', border: 'border-emerald-700/40 bg-emerald-950/20', dot: 'bg-emerald-400' },
  neutral: { text: 'text-gray-400',    border: 'border-gray-700/40 bg-gray-800/20',       dot: 'bg-gray-400'    },
  bearish: { text: 'text-red-400',     border: 'border-red-700/40 bg-red-950/20',         dot: 'bg-red-400'     },
}

function scoreConfig(score) {
  return SCORE_CONFIG.find(c => score <= c.max) ?? SCORE_CONFIG.at(-1)
}

function SentimentBar({ score }) {
  const cfg    = scoreConfig(score)
  const pct    = ((score - 1) / 9) * 100

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Score ring */}
      <div className="relative flex items-center justify-center w-28 h-28">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#1f2937" strokeWidth="10" />
          <circle
            cx="50" cy="50" r="42" fill="none"
            stroke={score >= 7 ? '#34d399' : score >= 5 ? '#facc15' : '#f87171'}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 264} 264`}
          />
        </svg>
        <div className="flex flex-col items-center">
          <span className={`text-3xl font-bold font-mono ${cfg.color}`}>{score}</span>
          <span className="text-xs text-gray-500">/10</span>
        </div>
      </div>
      <span className={`text-lg font-semibold ${cfg.color}`}>{cfg.label}</span>
    </div>
  )
}

function CatalystList({ items, variant }) {
  if (!items?.length) return null
  const isBull = variant === 'bull'
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-gray-300">
          <span className={`mt-0.5 shrink-0 ${isBull ? 'text-emerald-400' : 'text-red-400'}`}>
            {isBull ? '▲' : '▼'}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function ArticleCard({ article }) {
  const [expanded, setExpanded] = useState(false)
  const date = article.date ? article.date.slice(0, 10) : ''
  return (
    <div className="border border-gray-800 rounded-lg p-3 text-sm hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-left text-gray-200 hover:text-white font-medium leading-snug flex-1"
        >
          {article.title}
        </button>
        {article.url && (
          <a href={article.url} target="_blank" rel="noreferrer" className="shrink-0 text-blue-400 hover:text-blue-300 mt-0.5">
            <ExternalLink size={13} />
          </a>
        )}
      </div>
      <div className="flex gap-2 mt-1 text-xs text-gray-600">
        {article.publisher && <span>{article.publisher}</span>}
        {date && <><span>·</span><span>{date}</span></>}
      </div>
      {expanded && article.summary && (
        <p className="mt-2 text-xs text-gray-400 leading-relaxed border-t border-gray-800 pt-2">
          {article.summary}
        </p>
      )}
    </div>
  )
}

export default function SentimentAnalysis({ ticker, initialData = null, initialLoading = false }) {
  const [result, setResult]   = useState(initialData)
  const [loading, setLoading] = useState(initialLoading && !initialData)
  const [error, setError]     = useState(null)

  // Sync if parent finishes loading after mount
  useEffect(() => {
    if (initialData && !result) setResult(initialData)
    if (!initialData && !initialLoading && !result) setLoading(false)
  }, [initialData, initialLoading])

  const run = () => {
    setLoading(true); setError(null); setResult(null)
    api.getSentiment(ticker)
      .then(setResult)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  if (!result && !loading && !error) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 flex flex-col items-center gap-4">
        <Newspaper size={36} className="text-gray-600" />
        <div className="text-center">
          <p className="text-gray-300 font-medium">Market &amp; Investor Sentiment</p>
          <p className="text-gray-500 text-sm mt-1">
            Analyzes the latest news with Claude to rate sentiment and explain what's driving {ticker}.
          </p>
        </div>
        <button
          onClick={run}
          className="mt-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Analyze Sentiment
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">Reading live news and analyzing sentiment…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-3">
        <p className="text-red-400 text-sm">{error}</p>
        <button onClick={run} className="text-blue-400 text-sm hover:underline">Try again</button>
      </div>
    )
  }

  const a = result?.analysis ?? {}
  const score    = a.sentiment_score ?? 5
  const tone     = TONE_CONFIG[a.investor_tone] ?? TONE_CONFIG.cautious
  const bkd      = a.news_sentiment_breakdown ?? {}
  const total    = (bkd.bullish_count ?? 0) + (bkd.neutral_count ?? 0) + (bkd.bearish_count ?? 0)
  const bullPct  = total ? Math.round((bkd.bullish_count ?? 0) / total * 100) : 0
  const neutralPct = total ? Math.round((bkd.neutral_count ?? 0) / total * 100) : 0
  const bearPct  = total ? Math.round((bkd.bearish_count ?? 0) / total * 100) : 0

  return (
    <div className="space-y-4">
      {/* Score + summary card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Market &amp; Investor Sentiment
            </h2>
            <p className="text-xs text-gray-600 mt-0.5">
              {result.article_count} articles · {result.fetched_at?.slice(0, 10)} · {result.model}
            </p>
          </div>
          <button
            onClick={run}
            title="Refresh"
            className="p-1.5 text-gray-600 hover:text-gray-300 transition-colors rounded-lg hover:bg-gray-800"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <SentimentBar score={score} />

          <div className="flex-1 space-y-4">
            {/* One-line summary */}
            {a.one_line_summary && (
              <p className="text-gray-200 text-base leading-relaxed italic">
                "{a.one_line_summary}"
              </p>
            )}

            {/* Investor tone badge */}
            {a.investor_tone && (
              <div className={`inline-flex items-center gap-2 border rounded-lg px-3 py-1.5 ${tone.bg}`}>
                <span>{tone.emoji}</span>
                <span className={`text-sm font-semibold capitalize ${tone.color}`}>
                  {a.investor_tone} investor tone
                </span>
              </div>
            )}

            {/* News breakdown bar */}
            {total > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs text-gray-500 uppercase tracking-wide">
                  News Sentiment — {total} articles
                </div>
                <div className="flex h-2 rounded-full overflow-hidden gap-px">
                  {bullPct > 0    && <div className="bg-emerald-500" style={{ width: `${bullPct}%` }} />}
                  {neutralPct > 0 && <div className="bg-gray-600"    style={{ width: `${neutralPct}%` }} />}
                  {bearPct > 0    && <div className="bg-red-500"     style={{ width: `${bearPct}%` }} />}
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span className="text-emerald-400">{bkd.bullish_count ?? 0} bullish</span>
                  <span className="text-gray-400">{bkd.neutral_count ?? 0} neutral</span>
                  <span className="text-red-400">{bkd.bearish_count ?? 0} bearish</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drivers */}
      {a.what_is_driving_the_stock?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            What's Driving the Stock
          </h3>
          <ul className="space-y-2.5">
            {a.what_is_driving_the_stock.map((d, i) => (
              <li key={i} className="flex gap-3 text-sm text-gray-200">
                <span className="shrink-0 w-5 h-5 bg-blue-600/30 text-blue-400 rounded-full flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Bull / Bear two-column */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-emerald-900/40 rounded-xl p-5">
          <h3 className="text-xs font-semibold text-emerald-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <TrendingUp size={13} /> Bull Catalysts
          </h3>
          <CatalystList items={a.bull_catalysts} variant="bull" />
        </div>
        <div className="bg-gray-900 border border-red-900/40 rounded-xl p-5">
          <h3 className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <TrendingDown size={13} /> Bear Risks
          </h3>
          <CatalystList items={a.bear_risks} variant="bear" />
        </div>
      </div>

      {/* Key themes */}
      {a.key_themes?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Key Themes</h3>
          <div className="flex flex-wrap gap-2">
            {a.key_themes.map((t, i) => (
              <span key={i} className="px-3 py-1 bg-blue-900/30 border border-blue-800/40 text-blue-300 text-xs rounded-full">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notable headlines */}
      {a.notable_headlines?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Notable Headlines</h3>
          <div className="space-y-2.5">
            {a.notable_headlines.map((h, i) => {
              const sc = SENT_COLORS[h.sentiment] ?? SENT_COLORS.neutral
              return (
                <div key={i} className={`border rounded-lg p-3 ${sc.border}`}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${sc.dot}`} />
                    <div>
                      <p className="text-sm text-gray-200 font-medium leading-snug">{h.title}</p>
                      {h.why && <p className="text-xs text-gray-500 mt-1">{h.why}</p>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Source articles */}
      {result.articles?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Source Articles ({result.articles.length})
          </h3>
          <div className="space-y-2">
            {result.articles.map((art, i) => (
              <ArticleCard key={i} article={art} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
