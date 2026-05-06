import { useState, useEffect } from 'react'
import { api } from '../api.js'
import { Bell, BellOff, Trash2, CheckCircle, Clock, TrendingUp, TrendingDown, X, Mail, Send } from 'lucide-react'

// ── Inline form used inside StockDetail ──────────────────────────────────
export function AlertForm({ ticker, name, currentPrice, onCreated, onClose }) {
  const [targetPrice, setTargetPrice] = useState(currentPrice?.toFixed(2) ?? '')
  const [direction, setDirection]     = useState(currentPrice ? 'above' : 'above')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState(null)

  // Auto-set sensible direction when price changes
  useEffect(() => {
    if (!currentPrice || !targetPrice) return
    setDirection(parseFloat(targetPrice) > currentPrice ? 'above' : 'below')
  }, [targetPrice])

  const submit = async (e) => {
    e.preventDefault()
    const tp = parseFloat(targetPrice)
    if (!tp || tp <= 0) { setError('Enter a valid price'); return }
    setSaving(true); setError(null)
    try {
      const alert = await api.createAlert(ticker, name, tp, direction, currentPrice)
      onCreated?.(alert)
      onClose?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-yellow-400" />
          <span className="text-sm font-semibold text-gray-200">Set Price Alert — {ticker}</span>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-gray-600 hover:text-gray-400">
            <X size={14} />
          </button>
        )}
      </div>

      {currentPrice && (
        <p className="text-xs text-gray-500">Current price: <span className="font-mono text-gray-300">${currentPrice.toFixed(2)}</span></p>
      )}

      <div className="flex gap-2">
        {/* Direction toggle */}
        <div className="flex rounded-lg overflow-hidden border border-gray-700 shrink-0">
          {['above', 'below'].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1 transition-colors ${
                direction === d
                  ? d === 'above'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-red-700 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              {d === 'above' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {d}
            </button>
          ))}
        </div>

        {/* Price input */}
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={targetPrice}
            onChange={e => setTargetPrice(e.target.value)}
            placeholder="Target price"
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg pl-6 pr-3 py-1.5 focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>

        <button
          type="submit"
          disabled={saving || !targetPrice}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors shrink-0"
        >
          {saving ? '…' : 'Set'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  )
}


// ── Full alerts management panel (used in the global modal) ──────────────
export default function AlertsPanel({ onClose }) {
  const [alerts, setAlerts]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [emailCfg, setEmailCfg]       = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [testMsg, setTestMsg]         = useState(null)

  const reload = () => {
    setLoading(true)
    Promise.all([api.getAlerts(), api.getAlertConfig()])
      .then(([a, cfg]) => { setAlerts(a); setEmailCfg(cfg.email_configured) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [])

  const remove = async (id) => {
    await api.deleteAlert(id).catch(() => {})
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  const clearDone = async () => {
    await api.clearTriggeredAlerts().catch(() => {})
    setAlerts(prev => prev.filter(a => !a.triggered))
  }

  const sendTest = async () => {
    setTestSending(true); setTestMsg(null)
    try {
      await api.testAlertEmail()
      setTestMsg({ ok: true, text: 'Test email sent! Check your inbox.' })
    } catch (e) {
      setTestMsg({ ok: false, text: e.message })
    } finally {
      setTestSending(false)
    }
  }

  const active    = alerts.filter(a => !a.triggered)
  const triggered = alerts.filter(a => a.triggered)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-yellow-400" />
          <span className="font-semibold text-gray-100">Price Alerts</span>
          {active.length > 0 && (
            <span className="text-xs bg-yellow-500/20 border border-yellow-700/40 text-yellow-400 px-2 py-0.5 rounded-full">
              {active.length} active
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Email status */}
        <div className={`rounded-lg px-4 py-3 flex items-start gap-3 border text-sm ${
          emailCfg
            ? 'bg-emerald-950/30 border-emerald-800/40'
            : 'bg-yellow-950/30 border-yellow-800/40'
        }`}>
          <Mail size={14} className={`mt-0.5 shrink-0 ${emailCfg ? 'text-emerald-400' : 'text-yellow-400'}`} />
          <div className="flex-1 min-w-0">
            {emailCfg ? (
              <p className="text-emerald-300">Email alerts enabled</p>
            ) : (
              <>
                <p className="text-yellow-300 font-medium">Email alerts not configured</p>
                <p className="text-yellow-600 text-xs mt-0.5">
                  Add <code className="bg-yellow-950/60 px-1 rounded">ALERT_EMAIL_FROM</code> and{' '}
                  <code className="bg-yellow-950/60 px-1 rounded">GMAIL_APP_PASSWORD</code> to{' '}
                  <code className="bg-yellow-950/60 px-1 rounded">backend/.env</code>
                </p>
              </>
            )}
          </div>
          {emailCfg && (
            <button
              onClick={sendTest}
              disabled={testSending}
              className="shrink-0 flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-40"
            >
              <Send size={11} />{testSending ? 'Sending…' : 'Send test'}
            </button>
          )}
        </div>
        {testMsg && (
          <p className={`text-xs ${testMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{testMsg.text}</p>
        )}

        {/* Active alerts */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active</p>
          {loading ? (
            <p className="text-sm text-gray-600">Loading…</p>
          ) : active.length === 0 ? (
            <p className="text-sm text-gray-600">No active alerts. Set one from any stock detail page.</p>
          ) : (
            <div className="space-y-2">
              {active.map(a => (
                <AlertRow key={a.id} alert={a} onDelete={() => remove(a.id)} />
              ))}
            </div>
          )}
        </div>

        {/* Triggered alerts */}
        {triggered.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Triggered</p>
              <button onClick={clearDone} className="text-xs text-gray-600 hover:text-red-400 transition-colors">
                Clear all
              </button>
            </div>
            <div className="space-y-2">
              {triggered.map(a => (
                <AlertRow key={a.id} alert={a} onDelete={() => remove(a.id)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


function AlertRow({ alert: a, onDelete }) {
  const isAbove   = a.direction === 'above'
  const triggered = a.triggered
  const priceDiff = a.triggered_price
    ? ((a.triggered_price / a.price_at_creation) - 1) * 100
    : ((a.target_price    / a.price_at_creation) - 1) * 100

  return (
    <div className={`flex items-center gap-3 border rounded-lg px-3 py-2.5 ${
      triggered
        ? 'border-gray-700/50 bg-gray-800/30 opacity-70'
        : isAbove
          ? 'border-emerald-800/40 bg-emerald-950/10'
          : 'border-red-800/40 bg-red-950/10'
    }`}>
      <div className="shrink-0">
        {triggered
          ? <CheckCircle size={14} className="text-gray-500" />
          : isAbove
            ? <TrendingUp size={14} className="text-emerald-400" />
            : <TrendingDown size={14} className="text-red-400" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-semibold text-sm text-gray-200">{a.ticker}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
            isAbove ? 'text-emerald-400 bg-emerald-950/40' : 'text-red-400 bg-red-950/40'
          }`}>
            {isAbove ? '↑' : '↓'} {a.direction} ${a.target_price.toFixed(2)}
          </span>
          {triggered && (
            <span className="text-xs text-gray-600 flex items-center gap-0.5">
              <CheckCircle size={10} /> hit ${a.triggered_price?.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-600">
          <span className="flex items-center gap-0.5">
            <Clock size={10} /> {a.created_at?.slice(0, 10)}
          </span>
          <span>set at ${a.price_at_creation?.toFixed(2)}</span>
          <span className={priceDiff >= 0 ? 'text-emerald-600' : 'text-red-600'}>
            {priceDiff > 0 ? '+' : ''}{priceDiff.toFixed(1)}%
          </span>
        </div>
      </div>

      <button
        onClick={onDelete}
        className="shrink-0 p-1 text-gray-700 hover:text-red-400 transition-colors rounded"
        title="Delete alert"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}
