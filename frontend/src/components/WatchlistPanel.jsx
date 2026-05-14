import { useState, useEffect, useCallback } from 'react'
import { api, fmtLarge, fmt } from '../api.js'
import {
  Bookmark, Plus, Trash2, ChevronDown, ChevronRight,
  Pencil, Check, X, ExternalLink, RefreshCw,
} from 'lucide-react'

function PctBadge({ pct }) {
  if (pct == null) return <span className="text-gray-600 text-xs">—</span>
  const pos = pct >= 0
  return (
    <span className={`font-mono text-xs ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
      {pos ? '+' : ''}{pct.toFixed(2)}%
    </span>
  )
}

function TickerRow({ t, wlId, onRemove, onSelect }) {
  const change = t.regular_market_change
  const pct    = t.regular_market_change_pct

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-800/40 group">
      <button
        onClick={() => onSelect(t.symbol)}
        className="flex items-center gap-2 flex-1 min-w-0 text-left"
      >
        <span className="font-mono font-bold text-blue-400 text-sm w-14 shrink-0">{t.symbol}</span>
        <span className="text-xs text-gray-300 flex-1 truncate min-w-0">{t.name}</span>
      </button>

      <div className="flex items-center gap-3 shrink-0">
        {t.price != null && (
          <span className="font-mono text-xs text-gray-300">${t.price.toFixed(2)}</span>
        )}
        <PctBadge pct={pct} />
        {t.stale && <span className="text-[9px] text-gray-600">stale</span>}
      </div>

      <button
        onClick={() => onRemove(wlId, t.symbol)}
        className="p-1 text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
        title="Remove"
      >
        <X size={12} />
      </button>
    </div>
  )
}

function AddTickerRow({ wlId, onAdded }) {
  const [open, setOpen]     = useState(false)
  const [ticker, setTicker] = useState('')
  const [busy, setBusy]     = useState(false)

  const submit = () => {
    const sym = ticker.trim().toUpperCase()
    if (!sym) return
    setBusy(true)
    api.addToWatchlist(wlId, sym)
      .then(onAdded)
      .catch(() => {})
      .finally(() => { setBusy(false); setTicker(''); setOpen(false) })
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 px-4 py-2 text-xs text-gray-600 hover:text-blue-400 transition-colors"
    >
      <Plus size={11} /> Add ticker
    </button>
  )

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <input
        autoFocus
        value={ticker}
        onChange={e => setTicker(e.target.value.toUpperCase())}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false) }}
        placeholder="e.g. AAPL"
        className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1 w-24 focus:outline-none focus:border-blue-500 font-mono"
      />
      <button
        onClick={submit}
        disabled={busy || !ticker.trim()}
        className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-40 transition-colors"
      >
        Add
      </button>
      <button onClick={() => setOpen(false)} className="text-gray-600 hover:text-gray-300">
        <X size={13} />
      </button>
    </div>
  )
}

function WatchlistCard({ wl, onRefresh, onSelect }) {
  const [open, setOpen]         = useState(true)
  const [editing, setEditing]   = useState(false)
  const [name, setName]         = useState(wl.name)
  const [deleting, setDeleting] = useState(false)

  const saveRename = () => {
    if (!name.trim() || name === wl.name) { setEditing(false); return }
    api.renameWatchlist(wl.id, name).then(onRefresh).catch(() => {})
    setEditing(false)
  }

  const handleDelete = () => {
    if (!deleting) { setDeleting(true); return }
    api.deleteWatchlist(wl.id).then(onRefresh).catch(() => {})
  }

  const handleRemove = (wlId, ticker) => {
    api.removeFromWatchlist(wlId, ticker).then(onRefresh).catch(() => {})
  }

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden mb-3 mx-3">
      {/* Watchlist header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-900/60">
        <button onClick={() => setOpen(v => !v)} className="text-gray-500 hover:text-gray-300 shrink-0">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') { setName(wl.name); setEditing(false) } }}
            className="flex-1 bg-gray-800 border border-gray-600 text-gray-200 text-sm rounded px-2 py-0.5 focus:outline-none focus:border-blue-500"
          />
        ) : (
          <span className="flex-1 text-sm font-semibold text-gray-200">{wl.name}</span>
        )}

        <span className="text-[10px] text-gray-600 shrink-0">{wl.tickers.length} stocks</span>

        <div className="flex items-center gap-1 ml-1">
          {editing ? (
            <>
              <button onClick={saveRename} className="p-1 text-emerald-400 hover:text-emerald-300"><Check size={12} /></button>
              <button onClick={() => { setName(wl.name); setEditing(false) }} className="p-1 text-gray-500 hover:text-gray-300"><X size={12} /></button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="p-1 text-gray-600 hover:text-gray-400 transition-colors" title="Rename">
              <Pencil size={11} />
            </button>
          )}
          <button
            onClick={handleDelete}
            className={`p-1 transition-colors ${deleting ? 'text-red-400 hover:text-red-300' : 'text-gray-600 hover:text-gray-400'}`}
            title={deleting ? 'Click again to confirm delete' : 'Delete watchlist'}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Tickers */}
      {open && (
        <div className="divide-y divide-gray-800/50">
          {wl.tickers.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-600 italic">No stocks yet — add one below.</p>
          )}
          {wl.tickers.map(t => (
            <TickerRow key={t.symbol} t={t} wlId={wl.id} onRemove={handleRemove} onSelect={onSelect} />
          ))}
          <AddTickerRow wlId={wl.id} onAdded={onRefresh} />
        </div>
      )}
    </div>
  )
}

export default function WatchlistPanel({ onClose, onSelectStock, pendingTicker }) {
  const [watchlists, setWatchlists] = useState([])
  const [loading, setLoading]       = useState(true)
  const [creating, setCreating]     = useState(false)
  const [newName, setNewName]       = useState('')
  const [addingTo, setAddingTo]     = useState(null) // wl id when quick-adding a pending ticker

  const load = useCallback(() => {
    setLoading(true)
    api.getWatchlists()
      .then(data => { setWatchlists(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const createNew = () => {
    const name = newName.trim() || 'My Watchlist'
    api.createWatchlist(name).then(() => { setNewName(''); setCreating(false); load() }).catch(() => {})
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3.5 border-b border-gray-800 shrink-0">
        <Bookmark size={15} className="text-blue-400" />
        <span className="font-semibold text-gray-100 flex-1">Watchlists</span>
        <button onClick={load} className="p-1 text-gray-600 hover:text-gray-300 transition-colors" title="Refresh">
          <RefreshCw size={13} />
        </button>
        <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Quick-add banner when opened from a row star */}
      {pendingTicker && !loading && (
        <div className="px-3 py-2.5 bg-blue-950/30 border-b border-blue-800/40 shrink-0">
          <p className="text-xs text-blue-300 mb-2">
            Add <span className="font-bold font-mono">{pendingTicker.ticker}</span> to:
          </p>
          {watchlists.length === 0 ? (
            <p className="text-xs text-gray-500">Create a watchlist first.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {watchlists.map(wl => {
                const already = wl.tickers.some(t => t.symbol === pendingTicker.ticker)
                return (
                  <button
                    key={wl.id}
                    disabled={already}
                    onClick={() => {
                      api.addToWatchlist(wl.id, pendingTicker.ticker, pendingTicker.name)
                        .then(load).catch(() => {})
                    }}
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      already
                        ? 'bg-emerald-900/40 text-emerald-500 border border-emerald-800/40 cursor-default'
                        : 'bg-gray-800 hover:bg-blue-700 text-gray-200 border border-gray-700'
                    }`}
                  >
                    {already ? '✓ ' : ''}{wl.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto py-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-500 text-sm">
            <div className="w-4 h-4 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && watchlists.length === 0 && !creating && (
          <div className="text-center py-10 px-6">
            <Bookmark size={28} className="text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-1">No watchlists yet.</p>
            <p className="text-xs text-gray-600">Create one to track your favourite stocks.</p>
          </div>
        )}

        {!loading && watchlists.map(wl => (
          <WatchlistCard
            key={wl.id}
            wl={wl}
            onRefresh={load}
            onSelect={(ticker) => { onSelectStock(ticker); onClose() }}
          />
        ))}

        {/* New watchlist form */}
        {creating ? (
          <div className="flex items-center gap-2 mx-3 mt-1 mb-2 p-2 border border-blue-600/40 rounded-xl bg-blue-950/20">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createNew(); if (e.key === 'Escape') setCreating(false) }}
              placeholder="Watchlist name…"
              className="flex-1 bg-transparent text-gray-200 text-sm focus:outline-none placeholder-gray-600"
            />
            <button onClick={createNew} className="text-xs px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">
              Create
            </button>
            <button onClick={() => setCreating(false)} className="text-gray-500 hover:text-gray-300">
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 mx-3 mt-1 w-[calc(100%-1.5rem)] px-3 py-2 border border-dashed border-gray-700 hover:border-blue-600 text-gray-600 hover:text-blue-400 rounded-xl text-sm transition-colors"
          >
            <Plus size={14} /> New watchlist
          </button>
        )}
      </div>
    </div>
  )
}
