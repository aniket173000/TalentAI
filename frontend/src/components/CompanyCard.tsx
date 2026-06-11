import { useState } from 'react'
import { Job } from '../types'

const COLOR_SCHEMES = [
  {
    gradient: 'from-violet-500 to-purple-600',
    badge: 'bg-violet-100 text-violet-700',
    avatarText: 'text-violet-600',
  },
  {
    gradient: 'from-blue-500 to-indigo-600',
    badge: 'bg-blue-100 text-blue-700',
    avatarText: 'text-blue-600',
  },
  {
    gradient: 'from-emerald-500 to-teal-600',
    badge: 'bg-emerald-100 text-emerald-700',
    avatarText: 'text-emerald-600',
  },
  {
    gradient: 'from-orange-500 to-amber-500',
    badge: 'bg-orange-100 text-orange-700',
    avatarText: 'text-orange-600',
  },
  {
    gradient: 'from-pink-500 to-rose-500',
    badge: 'bg-pink-100 text-pink-700',
    avatarText: 'text-pink-600',
  },
  {
    gradient: 'from-cyan-500 to-sky-600',
    badge: 'bg-cyan-100 text-cyan-700',
    avatarText: 'text-cyan-600',
  },
  {
    gradient: 'from-red-500 to-rose-600',
    badge: 'bg-red-100 text-red-700',
    avatarText: 'text-red-600',
  },
  {
    gradient: 'from-lime-600 to-green-600',
    badge: 'bg-lime-100 text-lime-700',
    avatarText: 'text-lime-700',
  },
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = s.charCodeAt(i) + ((h << 5) - h)
  }
  return Math.abs(h)
}

/**
 * Logo priority:
 *  1. server-resolved company_logo_url (stored after job creation)
 *  2. client-side Clearbit attempt using the company domain
 *  3. colored initials fallback (handled via onError)
 */
function getBestLogoUrl(jobs: Job[]): string | null {
  // Prefer the server-resolved URL stored in the first job that has one
  const resolved = jobs.find(j => j.company_logo_url)?.company_logo_url
  if (resolved) return resolved

  // Fall back to client-side Clearbit using company_url
  const companyUrl = jobs.find(j => j.company_url)?.company_url
  if (!companyUrl) return null
  try {
    const full = companyUrl.startsWith('http') ? companyUrl : `https://${companyUrl}`
    const { hostname } = new URL(full)
    // Skip LinkedIn — client-side Clearbit can't resolve those
    if (hostname.includes('linkedin.com')) return null
    return `https://logo.clearbit.com/${hostname}`
  } catch {
    return null
  }
}

interface Props {
  name: string
  jobs: Job[]
  onSelect: () => void
}

export default function CompanyCard({ name, jobs, onSelect }: Props) {
  const [logoError, setLogoError] = useState(false)

  const scheme = COLOR_SCHEMES[hashStr(name) % COLOR_SCHEMES.length]
  const companyUrl = jobs.find(j => j.company_url)?.company_url
  const logoUrl = getBestLogoUrl(jobs)
  const initials = name
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const departments = [
    ...new Set(jobs.map(j => j.department).filter((d): d is string => !!d)),
  ].slice(0, 3)

  const displayUrl = companyUrl
    ? companyUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
    : null

  return (
    <button
      onClick={onSelect}
      className="group text-left bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-2xl hover:border-transparent hover:-translate-y-1.5 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
    >
      {/* Gradient header */}
      <div className={`h-24 bg-gradient-to-br ${scheme.gradient} relative`}>
        {/* Logo badge — peeking below the header */}
        <div className="absolute -bottom-8 left-5">
          <div className="w-16 h-16 rounded-2xl bg-white shadow-lg border border-slate-100 flex items-center justify-center overflow-hidden">
            {logoUrl && !logoError ? (
              <img
                src={logoUrl}
                alt={name}
                className="w-11 h-11 object-contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <span className={`text-2xl font-black ${scheme.avatarText}`}>{initials}</span>
            )}
          </div>
        </div>

        {/* Roles count badge */}
        <div className="absolute top-3 right-3">
          <span className="bg-white/25 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full border border-white/30">
            {jobs.length} {jobs.length === 1 ? 'role' : 'roles'}
          </span>
        </div>
      </div>

      {/* Card body */}
      <div className="pt-11 pb-5 px-5">
        <h3 className="font-extrabold text-slate-900 text-lg group-hover:text-brand-blue transition-colors leading-tight line-clamp-1">
          {name}
        </h3>

        {displayUrl && (
          <p className="text-xs text-slate-400 mt-0.5 truncate flex items-center gap-1">
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            {displayUrl}
          </p>
        )}

        {/* Department chips */}
        {departments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {departments.map(d => (
              <span key={d} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${scheme.badge}`}>
                {d}
              </span>
            ))}
            {jobs.filter(j => j.department).length > 3 && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
                +{jobs.filter(j => j.department).length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Employment types preview */}
        <div className="mt-3 flex flex-wrap gap-1">
          {[...new Set(jobs.map(j => j.employment_type).filter((t): t is NonNullable<typeof t> => !!t))].map(t => (
            <span key={t} className="text-[11px] text-slate-400 font-medium bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
              {t}
            </span>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {jobs.map(j => j.location).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(' · ')}
          </span>
          <span className="text-sm font-bold text-brand-blue flex items-center gap-1 group-hover:gap-2 transition-all duration-200">
            View roles
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </button>
  )
}
