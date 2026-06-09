interface Props {
  score: number
  size?: number
}

export default function ScoreRing({ score, size = 140 }: Props) {
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  const color =
    score >= 90 ? '#10b981' :
    score >= 80 ? '#4a6cf7' :
    score >= 70 ? '#f59e0b' : '#ef4444'

  const label =
    score >= 90 ? 'Excellent' :
    score >= 80 ? 'Strong Match' :
    score >= 70 ? 'Partial Match' : 'Low Match'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
          />
        </svg>
        <div className="absolute flex flex-col items-center leading-tight">
          <span className="font-bold text-3xl" style={{ color }}>
            {score.toFixed(0)}
          </span>
          <span className="text-xs text-slate-400 font-medium">/ 100</span>
        </div>
      </div>
      <span className="text-sm font-semibold" style={{ color }}>{label}</span>
    </div>
  )
}
