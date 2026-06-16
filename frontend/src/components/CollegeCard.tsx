import { useState } from 'react'
import { CollegeInfo } from '../types'

const COLOR_SCHEMES = [
  { gradient: 'from-violet-600 via-purple-600 to-indigo-700', glow: 'shadow-violet-500/30', badge: 'bg-violet-400/20 text-violet-300 border-violet-400/30', accent: 'text-violet-400' },
  { gradient: 'from-pink-600 via-rose-600 to-orange-500', glow: 'shadow-pink-500/30', badge: 'bg-pink-400/20 text-pink-300 border-pink-400/30', accent: 'text-pink-400' },
  { gradient: 'from-cyan-500 via-sky-600 to-blue-700', glow: 'shadow-cyan-500/30', badge: 'bg-cyan-400/20 text-cyan-300 border-cyan-400/30', accent: 'text-cyan-400' },
  { gradient: 'from-emerald-500 via-teal-600 to-cyan-700', glow: 'shadow-emerald-500/30', badge: 'bg-emerald-400/20 text-emerald-300 border-emerald-400/30', accent: 'text-emerald-400' },
  { gradient: 'from-amber-500 via-orange-500 to-red-600', glow: 'shadow-amber-500/30', badge: 'bg-amber-400/20 text-amber-300 border-amber-400/30', accent: 'text-amber-400' },
  { gradient: 'from-blue-600 via-indigo-600 to-violet-700', glow: 'shadow-blue-500/30', badge: 'bg-blue-400/20 text-blue-300 border-blue-400/30', accent: 'text-blue-400' },
  { gradient: 'from-fuchsia-600 via-pink-600 to-rose-600', glow: 'shadow-fuchsia-500/30', badge: 'bg-fuchsia-400/20 text-fuchsia-300 border-fuchsia-400/30', accent: 'text-fuchsia-400' },
  { gradient: 'from-lime-500 via-green-600 to-emerald-700', glow: 'shadow-lime-500/30', badge: 'bg-lime-400/20 text-lime-300 border-lime-400/30', accent: 'text-lime-400' },
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h)
}

interface Props {
  college: CollegeInfo
  onSelect: () => void
}

export default function CollegeCard({ college, onSelect }: Props) {
  const [logoErr, setLogoErr] = useState(false)
  const scheme = COLOR_SCHEMES[hashStr(college.college_name) % COLOR_SCHEMES.length]

  // Prefer AI short_name, fall back to derived initials
  const badge = college.short_name || college.college_name
    .split(/[\s,]+/)
    .filter(w => /^[A-Z]/i.test(w))
    .map(w => w[0].toUpperCase())
    .slice(0, 4)
    .join('')

  return (
    <button
      onClick={onSelect}
      className={`group text-left bg-slate-900 rounded-3xl border border-slate-700/60 overflow-hidden
        hover:-translate-y-2 hover:shadow-2xl ${scheme.glow}
        hover:border-slate-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-violet-500/40`}
    >
      {/* Gradient header */}
      <div className={`h-28 bg-gradient-to-br ${scheme.gradient} relative overflow-hidden`}>
        {/* Decorative blobs */}
        <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10" />
        <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-white/10" />
        <div className="absolute top-2 left-4 w-8 h-8 rounded-full bg-white/5" />

        {/* Logo */}
        <div className="absolute -bottom-7 left-5">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 border-2 border-slate-700 shadow-xl flex items-center justify-center overflow-hidden">
            {college.college_logo_url && !logoErr ? (
              <img
                src={college.college_logo_url}
                alt={college.college_name}
                className="w-10 h-10 object-contain"
                onError={() => setLogoErr(true)}
              />
            ) : (
              <span className={`text-sm font-black ${scheme.accent}`}>{badge || '🎓'}</span>
            )}
          </div>
        </div>

        {/* Total count pill */}
        <div className="absolute top-3 right-3">
          <span className="bg-black/30 backdrop-blur-sm text-white text-[10px] font-black px-3 py-1 rounded-full border border-white/20">
            {college.total} {college.total === 1 ? 'member' : 'members'}
          </span>
        </div>
      </div>

      {/* Card body */}
      <div className="pt-10 pb-5 px-5">
        <h3 className="font-black text-white text-base leading-tight line-clamp-2 group-hover:text-violet-300 transition-colors">
          {college.college_name}
        </h3>

        {/* Stats row */}
        <div className="mt-3 flex gap-2">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${scheme.badge}`}>
            📚 {college.current_students} studying
          </span>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border bg-slate-700/50 text-slate-400 border-slate-600">
            🎓 {college.alumni} alumni
          </span>
        </div>

        {/* Progress bar — ratio of students vs alumni */}
        {college.total > 0 && (
          <div className="mt-3">
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${scheme.gradient} rounded-full transition-all duration-500`}
                style={{ width: `${(college.current_students / college.total) * 100}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-slate-500">Current</span>
              <span className="text-[9px] text-slate-500">Alumni</span>
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between">
          <span className="text-[10px] text-slate-500 font-medium">
            {college.total > 0 ? 'See all members →' : 'Be the first →'}
          </span>
          <span className={`text-xs font-black ${scheme.accent} flex items-center gap-1 group-hover:gap-2 transition-all`}>
            Explore
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </button>
  )
}
