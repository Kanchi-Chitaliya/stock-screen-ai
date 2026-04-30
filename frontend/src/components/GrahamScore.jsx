import { CheckCircle, XCircle } from 'lucide-react'

function ScoreRing({ score }) {
  const radius = 36
  const circ = 2 * Math.PI * radius
  const filled = (score / 10) * circ
  const color = score >= 7 ? '#34d399' : score >= 4 ? '#facc15' : '#f87171'

  return (
    <svg width={90} height={90} viewBox="0 0 90 90">
      <circle cx={45} cy={45} r={radius} fill="none" stroke="#1f2937" strokeWidth={8} />
      <circle
        cx={45} cy={45} r={radius}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 45 45)"
      />
      <text x={45} y={45} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={18} fontWeight={700}>
        {score}
      </text>
      <text x={45} y={60} textAnchor="middle" fill="#6b7280" fontSize={9}>
        / 10
      </text>
    </svg>
  )
}

const SECTOR_MODE_LABEL = {
  financial:        { label: 'Financial mode',        color: 'bg-blue-950 border-blue-800 text-blue-300' },
  capital_intensive:{ label: 'Capital-intensive mode', color: 'bg-purple-950 border-purple-800 text-purple-300' },
  standard:         { label: 'Standard mode',          color: 'bg-gray-800 border-gray-700 text-gray-400' },
}

export default function GrahamScore({ graham_score, graham_number, price }) {
  if (!graham_score) return null
  const { score, criteria, sector_mode } = graham_score
  const modeInfo = SECTOR_MODE_LABEL[sector_mode] ?? SECTOR_MODE_LABEL.standard

  const label = score >= 7 ? 'Strong' : score >= 4 ? 'Moderate' : 'Weak'
  const labelColor = score >= 7 ? 'text-emerald-400' : score >= 4 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
        Fundamental Score
      </h3>

      <div className="flex items-center gap-6 mb-5">
        <ScoreRing score={score} />
        <div>
          <div className={`text-2xl font-bold ${labelColor}`}>{label}</div>
          <div className="text-xs text-gray-500 mt-1">sector-adjusted fundamentals score</div>
          <span className={`mt-2 inline-block text-xs px-2 py-0.5 rounded border ${modeInfo.color}`}>
            {modeInfo.label}
          </span>
          {graham_number && (
            <div className="mt-2 text-sm">
              <span className="text-gray-400">Graham Number: </span>
              <span className="font-mono font-semibold text-blue-300">${graham_number.toFixed(2)}</span>
              {price && (
                <span className={`ml-2 text-xs font-mono ${price <= graham_number ? 'text-emerald-400' : 'text-red-400'}`}>
                  {price <= graham_number ? '▼ Undervalued' : '▲ Overvalued'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {criteria?.map((c, i) => (
          <div key={i} className="flex items-start gap-2 text-sm" title={c.note || undefined}>
            {c.passed
              ? <CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" />
              : <XCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
            }
            <div className="flex-1 min-w-0">
              <span className="text-gray-300">{c.name}</span>
              {c.note && <div className="text-xs text-gray-600 mt-0.5 leading-tight">{c.note}</div>}
            </div>
            <span className="font-mono text-xs text-gray-400 shrink-0">{c.value}</span>
            <span className="text-xs text-gray-600 shrink-0">{c.threshold}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
