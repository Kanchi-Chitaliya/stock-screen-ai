import { useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { fmtLarge } from '../api.js'

const GRID   = '#1f2937'
const AXIS   = '#4b5563'
const TIP_BG = '#111827'
const TIP_BD = '#374151'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border text-xs px-3 py-2" style={{ background: TIP_BG, borderColor: TIP_BD }}>
      <div className="font-semibold text-gray-200 mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }} className="flex gap-3">
          <span>{p.name}</span>
          <span className="font-mono ml-auto">{p.value != null ? p.value : '—'}</span>
        </div>
      ))}
    </div>
  )
}

function yFmtLarge(v) {
  if (v == null) return ''
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(1)}T`
  if (Math.abs(v) >= 1e9)  return `$${(v / 1e9).toFixed(0)}B`
  if (Math.abs(v) >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`
  return `$${v}`
}

const axisStyle = { fill: AXIS, fontSize: 11 }

/* ---- Price chart ---- */
const PRICE_RANGES = [
  { label: '1Y', months: 12 },
  { label: '3Y', months: 36 },
  { label: '5Y', months: 60 },
]

export function PriceChart({ data }) {
  const [range, setRange] = useState('3Y')
  if (!data?.length) return <NoData />

  const months = PRICE_RANGES.find(r => r.label === range)?.months ?? 36
  const cutoff  = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const filtered = data.filter(d => new Date(d.date) >= cutoff)

  return (
    <div className="space-y-3">
      <div className="flex gap-1 justify-end">
        {PRICE_RANGES.map(r => (
          <button key={r.label} onClick={() => setRange(r.label)}
            className={`px-2.5 py-0.5 text-xs rounded transition-colors ${
              range === r.label ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}>
            {r.label}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={filtered} margin={{ top: 10, right: 8, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="date" tick={axisStyle} tickLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={v => `$${v}`} tick={axisStyle} tickLine={false} width={60} />
          <Tooltip content={<ChartTooltip />} formatter={v => [`$${v.toFixed(2)}`, 'Price']} />
          <Area type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} fill="url(#priceGrad)" dot={false} name="Price" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ---- Revenue & Net Income ---- */
export function RevenueChart({ data }) {
  if (!data?.length) return <NoData />
  const d = data.map(r => ({
    ...r,
    revenue_B: r.revenue ? +(r.revenue / 1e9).toFixed(2) : null,
    net_income_B: r.net_income ? +(r.net_income / 1e9).toFixed(2) : null,
  }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={d} margin={{ top: 10, right: 8, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="period" tick={axisStyle} tickLine={false} />
        <YAxis tickFormatter={v => `$${v}B`} tick={axisStyle} tickLine={false} width={60} />
        <Tooltip content={<ChartTooltip />} formatter={v => [`$${v}B`]} />
        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
        <Bar dataKey="revenue_B" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="net_income_B" name="Net Income" fill="#10b981" radius={[4, 4, 0, 0]} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ---- Margins ---- */
export function MarginsChart({ data }) {
  if (!data?.length) return <NoData />
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 8, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="period" tick={axisStyle} tickLine={false} />
        <YAxis tickFormatter={v => `${v}%`} tick={axisStyle} tickLine={false} width={50} />
        <Tooltip content={<ChartTooltip />} formatter={v => [`${v?.toFixed(1)}%`]} />
        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
        <ReferenceLine y={0} stroke={GRID} />
        <Line type="monotone" dataKey="gross_margin"     name="Gross Margin"     stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
        <Line type="monotone" dataKey="operating_margin" name="Operating Margin" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
        <Line type="monotone" dataKey="net_margin"       name="Net Margin"       stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

/* ---- Free Cash Flow ---- */
export function FCFChart({ data }) {
  if (!data?.length) return <NoData />
  const d = data.map(r => ({
    ...r,
    ocf_B: r.operating_cashflow ? +(r.operating_cashflow / 1e9).toFixed(2) : null,
    fcf_B: r.fcf ? +(r.fcf / 1e9).toFixed(2) : null,
    capex_B: r.capex ? +(r.capex / 1e9).toFixed(2) : null,
  }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={d} margin={{ top: 10, right: 8, left: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="fcfGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#10b981" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="period" tick={axisStyle} tickLine={false} />
        <YAxis tickFormatter={v => `$${v}B`} tick={axisStyle} tickLine={false} width={60} />
        <Tooltip content={<ChartTooltip />} formatter={v => [`$${v}B`]} />
        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
        <ReferenceLine y={0} stroke="#374151" />
        <Bar dataKey="ocf_B"   name="Op. Cash Flow" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="capex_B" name="CapEx"         fill="#ef4444" radius={[4, 4, 0, 0]} />
        <Area type="monotone" dataKey="fcf_B" name="Free Cash Flow" stroke="#10b981" strokeWidth={2} fill="url(#fcfGrad)" dot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ---- Debt & Equity ---- */
export function DebtChart({ data }) {
  if (!data?.length) return <NoData />
  const d = data.map(r => ({
    ...r,
    debt_B:  r.total_debt ? +(r.total_debt  / 1e9).toFixed(2) : null,
    cash_B:  r.cash       ? +(r.cash        / 1e9).toFixed(2) : null,
    equity_B:r.equity     ? +(r.equity      / 1e9).toFixed(2) : null,
  }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={d} margin={{ top: 10, right: 8, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="period" tick={axisStyle} tickLine={false} />
        <YAxis tickFormatter={v => `$${v}B`} tick={axisStyle} tickLine={false} width={60} />
        <Tooltip content={<ChartTooltip />} formatter={v => [`$${v}B`]} />
        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
        <Bar dataKey="equity_B" name="Equity"     fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="cash_B"   name="Cash"       fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="debt_B"   name="Total Debt" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ---- EPS ---- */
export function EPSChart({ data }) {
  if (!data?.length) return <NoData />
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 10, right: 8, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="period" tick={axisStyle} tickLine={false} />
        <YAxis tickFormatter={v => `$${v}`} tick={axisStyle} tickLine={false} width={55} />
        <Tooltip content={<ChartTooltip />} formatter={v => [`$${v?.toFixed(2)}`]} />
        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
        <ReferenceLine y={0} stroke="#374151" />
        <Bar dataKey="eps" name="EPS" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ---- ROIC trend ---- */
export function ROICChart({ data }) {
  const d = data?.filter(r => r.roic != null)
  if (!d?.length) return <NoData />
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={d} margin={{ top: 10, right: 8, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="period" tick={axisStyle} tickLine={false} />
        <YAxis tickFormatter={v => `${v}%`} tick={axisStyle} tickLine={false} width={50} />
        <Tooltip content={<ChartTooltip />} formatter={v => [`${v?.toFixed(1)}%`]} />
        <ReferenceLine y={12} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: '12% hurdle', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }} />
        <ReferenceLine y={0}  stroke={GRID} />
        <Bar dataKey="roic" name="ROIC %" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ---- Share count (millions) ---- */
export function SharesChart({ data }) {
  const d = data?.filter(r => r.shares != null)
  if (!d?.length) return <NoData />
  const domain = d.map(r => r.shares)
  const min = Math.min(...domain)
  const max = Math.max(...domain)
  const trend = d.length >= 2 ? (d[d.length - 1].shares < d[0].shares ? 'buybacks ▼' : 'dilution ▲') : ''
  const trendColor = trend.includes('buybacks') ? '#10b981' : '#f87171'
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={d} margin={{ top: 10, right: 8, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="period" tick={axisStyle} tickLine={false} />
        <YAxis
          tickFormatter={v => `${v.toFixed(0)}M`}
          tick={axisStyle} tickLine={false} width={60}
          domain={[min * 0.92, max * 1.05]}
        />
        <Tooltip content={<ChartTooltip />} formatter={v => [`${v?.toFixed(1)}M shares`]} />
        <Bar dataKey="shares" name="Shares (M)" fill={trend.includes('buybacks') ? '#10b981' : '#f87171'} radius={[4, 4, 0, 0]} />
        <text x="98%" y={18} textAnchor="end" fill={trendColor} fontSize={11}>{trend}</text>
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function NoData() {
  return (
    <div className="h-64 flex items-center justify-center text-gray-600 text-sm">
      No historical data available
    </div>
  )
}
