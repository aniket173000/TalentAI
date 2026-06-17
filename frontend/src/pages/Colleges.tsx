import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import CollegeCard from '../components/CollegeCard'
import LoadingSpinner from '../components/LoadingSpinner'
import { useAuth } from '../context/AuthContext'
import { CampusJob, CollegeCandidateEntry, CollegeDetail, CollegeInfo } from '../types'

const SCHEME_GRADIENTS = [
  'from-violet-600 via-purple-600 to-indigo-700',
  'from-pink-600 via-rose-600 to-orange-500',
  'from-cyan-500 via-sky-600 to-blue-700',
  'from-emerald-500 via-teal-600 to-cyan-700',
  'from-amber-500 via-orange-500 to-red-600',
  'from-blue-600 via-indigo-600 to-violet-700',
  'from-fuchsia-600 via-pink-600 to-rose-600',
  'from-lime-500 via-green-600 to-emerald-700',
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h)
}

// ── Candidate Profile Modal ──────────────────────────────────────────────────

function ProfileModal({ person, collegeName, onClose }: {
  person: CollegeCandidateEntry
  collegeName: string
  onClose: () => void
}) {
  const gradient = SCHEME_GRADIENTS[hashStr(person.full_name) % SCHEME_GRADIENTS.length]
  const initials = person.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-slate-900 rounded-3xl border border-slate-700 overflow-hidden shadow-2xl"
        style={{ animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(24px) scale(0.95); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        {/* Gradient header */}
        <div className={`h-24 bg-gradient-to-br ${gradient} relative`}>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/30 flex items-center justify-center text-white hover:bg-black/50 transition-colors text-xs"
          >
            ✕
          </button>
          <div className="absolute -bottom-7 left-5">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} border-2 border-slate-800 shadow-xl flex items-center justify-center`}>
              <span className="text-xl font-black text-white">{initials}</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="pt-10 px-5 pb-6">
          <h2 className="text-lg font-black text-white">{person.full_name}</h2>
          <p className="text-slate-500 text-xs mt-0.5">{collegeName}</p>

          <div className="mt-4 space-y-3">
            {/* Batch */}
            <div className="flex items-center gap-3">
              <span className="w-7 text-center text-base">🎓</span>
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-wide">Batch</p>
                <p className="text-white text-sm font-semibold">
                  {person.graduation_year
                    ? person.is_graduated
                      ? `Class of ${person.graduation_year}`
                      : `Graduating ${person.graduation_year}`
                    : person.is_graduated ? 'Alumni' : 'Current Student'}
                </p>
              </div>
            </div>

            {/* Company — alumni only */}
            {person.is_graduated && person.current_company && (
              <div className="flex items-center gap-3">
                <span className="w-7 text-center text-base">💼</span>
                <div>
                  <p className="text-slate-500 text-[10px] uppercase tracking-wide">Currently at</p>
                  <p className="text-white text-sm font-semibold">{person.current_company}</p>
                </div>
              </div>
            )}

            {/* Email */}
            <div className="flex items-center gap-3">
              <span className="w-7 text-center text-base">📧</span>
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-wide">Email</p>
                <a href={`mailto:${person.email}`} className="text-violet-400 text-sm font-semibold hover:underline">
                  {person.email}
                </a>
              </div>
            </div>

            {/* LinkedIn */}
            {person.candidate_linkedin_url && (
              <div className="flex items-center gap-3">
                <span className="w-7 text-center text-base">🔗</span>
                <div>
                  <p className="text-slate-500 text-[10px] uppercase tracking-wide">LinkedIn</p>
                  <a
                    href={person.candidate_linkedin_url.startsWith('http') ? person.candidate_linkedin_url : `https://${person.candidate_linkedin_url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 text-sm font-semibold hover:underline truncate block max-w-[220px]"
                  >
                    {person.candidate_linkedin_url.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '').replace(/\/$/, '') || 'View Profile'}
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Candidate row card ───────────────────────────────────────────────────────

function CandidateRow({ person, idx, onView }: { person: CollegeCandidateEntry; idx: number; onView: () => void }) {
  const gradient = SCHEME_GRADIENTS[(hashStr(person.full_name) + idx) % SCHEME_GRADIENTS.length]
  const initials = person.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl px-5 py-4 flex items-center gap-4 hover:border-slate-500 hover:bg-slate-800 transition-all group">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white shrink-0 bg-gradient-to-br ${gradient}`}>
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-bold truncate">{person.full_name}</p>
        <p className="text-slate-500 text-xs">
          {person.graduation_year
            ? person.is_graduated ? `Class of ${person.graduation_year}` : `Graduating ${person.graduation_year}`
            : person.is_graduated ? 'Alumni' : 'Current Student'}
          {person.current_company && ` · ${person.current_company}`}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {person.candidate_linkedin_url && (
          <a
            href={person.candidate_linkedin_url.startsWith('http') ? person.candidate_linkedin_url : `https://${person.candidate_linkedin_url}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-600/40 flex items-center justify-center text-blue-400 hover:bg-blue-600/40 transition-colors text-xs"
            title="LinkedIn"
          >
            in
          </a>
        )}
        <button
          onClick={onView}
          className="text-xs font-bold text-violet-400 border border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/25 rounded-lg px-3 py-1.5 transition-all"
        >
          View Profile
        </button>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Colleges() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [colleges, setColleges] = useState<CollegeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<CollegeDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'current' | 'alumni'>('current')
  const [logoErr, setLogoErr] = useState(false)
  const [viewingProfile, setViewingProfile] = useState<CollegeCandidateEntry | null>(null)
  const [campusJobs, setCampusJobs] = useState<CampusJob[]>([])
  const [campusJobsLoading, setCampusJobsLoading] = useState(false)

  useEffect(() => {
    api
      .get<CollegeInfo[]>('/colleges/')
      .then(r => setColleges(r.data))
      .catch(() => setError('Failed to load colleges.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selected) return
    setDetailLoading(true)
    setLogoErr(false)
    setActiveTab('current')
    setCampusJobs([])
    api
      .get<CollegeDetail>(`/colleges/${encodeURIComponent(selected)}`)
      .then(r => setDetail(r.data))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false))

    // Fetch campus jobs for this college
    const isRecruiter = user?.is_recruiter
    const isMatchingCandidate = user?.is_candidate && user.college_name === selected
    if (isRecruiter || isMatchingCandidate) {
      setCampusJobsLoading(true)
      api
        .get<CampusJob[]>(`/colleges/${encodeURIComponent(selected)}/campus-jobs`)
        .then(r => setCampusJobs(r.data))
        .catch(() => setCampusJobs([]))
        .finally(() => setCampusJobsLoading(false))
    }
  }, [selected, user])

  const filtered = colleges.filter(c =>
    !search.trim() || c.college_name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div className="max-w-6xl mx-auto px-4 py-24"><LoadingSpinner message="Loading colleges…" /></div>
  )

  // ── Detail view ─────────────────────────────────────────────────────────────
  if (selected && detail) {
    const gradient = SCHEME_GRADIENTS[hashStr(selected) % SCHEME_GRADIENTS.length]
    const badge = detail.short_name || selected.split(/[\s,]+/).filter(w => /^[A-Z]/i.test(w)).map(w => w[0].toUpperCase()).slice(0, 4).join('')
    const displayList = activeTab === 'current' ? detail.current_students : detail.alumni
    const ai = detail.ai_info

    return (
      <div className="min-h-screen bg-slate-950 text-white">
        {viewingProfile && (
          <ProfileModal person={viewingProfile} collegeName={selected} onClose={() => setViewingProfile(null)} />
        )}

        <div className="max-w-5xl mx-auto px-4 py-10">
          {/* Back */}
          <button
            onClick={() => { setSelected(null); setDetail(null) }}
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-8 transition-colors group"
          >
            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All Colleges <span className="text-slate-600">/</span>
            <span className="text-white font-semibold">{selected}</span>
          </button>

          {/* Hero card */}
          <div className={`relative rounded-3xl overflow-hidden mb-8 shadow-2xl bg-gradient-to-br ${gradient}`}>
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 70% 20%, white 0%, transparent 50%)' }} />
            <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/10" />

            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6 p-8">
              {/* Logo / badge */}
              <div className="w-20 h-20 rounded-2xl bg-slate-900/80 border border-white/20 shadow-xl flex items-center justify-center overflow-hidden shrink-0">
                {detail.college_logo_url && !logoErr ? (
                  <img src={detail.college_logo_url} alt={selected} className="w-14 h-14 object-contain" onError={() => setLogoErr(true)} />
                ) : (
                  <span className="text-xl font-black text-white">{badge || '🎓'}</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-black text-white leading-tight">{selected}</h1>
                {ai?.location && <p className="text-white/70 text-sm mt-0.5">📍 {ai.location}{ai.founded_year ? ` · Est. ${ai.founded_year}` : ''}</p>}
                {detail.website_url && (
                  <a href={detail.website_url.startsWith('http') ? detail.website_url : `https://${detail.website_url}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-white/60 hover:text-white text-xs mt-1 transition-colors">
                    🔗 {detail.website_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                  </a>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full border border-white/25">📚 {detail.current_students.length} studying</span>
                  <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full border border-white/25">🎓 {detail.alumni.length} alumni</span>
                  <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full border border-white/25">👥 {detail.current_students.length + detail.alumni.length} total</span>
                </div>
              </div>
            </div>
          </div>

          {/* Two-column layout: AI info + Talent stats */}
          <div className="grid gap-4 sm:grid-cols-2 mb-8">

            {/* About */}
            {ai && (ai.description || ai.highlights.length > 0) && (
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">About</p>
                {ai.description && <p className="text-slate-300 text-sm leading-relaxed mb-4">{ai.description}</p>}
                {ai.highlights.length > 0 && (
                  <ul className="space-y-2">
                    {ai.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="text-violet-400 mt-0.5 shrink-0">✦</span>
                        {h}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Talent snapshot */}
            <div className="space-y-4">
              {ai && ai.talent_strengths.length > 0 && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Talent Strengths</p>
                  <div className="flex flex-wrap gap-2">
                    {ai.talent_strengths.map((s, i) => (
                      <span key={i} className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {detail.talent_stats.top_companies.length > 0 && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Alumni Work At</p>
                  <div className="flex flex-wrap gap-2">
                    {detail.talent_stats.top_companies.map((c, i) => (
                      <span key={i} className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">🏢 {c}</span>
                    ))}
                  </div>
                </div>
              )}

              {detail.talent_stats.top_skills.length > 0 && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Top Skills on Platform</p>
                  <div className="flex flex-wrap gap-2">
                    {detail.talent_stats.top_skills.map((s, i) => (
                      <span key={i} className="text-xs font-bold px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Recruiter CTA */}
          <div className={`bg-gradient-to-r ${gradient} rounded-2xl p-5 mb-8 flex items-center justify-between gap-4`}>
            <div>
              <p className="text-white font-black text-sm">🎯 Recruiting from {detail.short_name || selected}?</p>
              <p className="text-white/70 text-xs mt-0.5">Post a campus job — only candidates from this college will see it.</p>
            </div>
            <button
              onClick={() => {
                if (user?.is_recruiter) {
                  navigate(`/recruiter/jobs/create?campus=${encodeURIComponent(selected)}`)
                } else {
                  navigate('/login')
                }
              }}
              className="shrink-0 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-4 py-2 rounded-xl border border-white/30 transition-colors"
            >
              Post a Campus Job →
            </button>
          </div>

          {/* Campus Hiring section — visible to recruiters + matching candidates */}
          {(user?.is_recruiter || (user?.is_candidate && user.college_name === selected)) && (
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-slate-700/50" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2">🏛️ Campus Hiring</p>
                <div className="flex-1 h-px bg-slate-700/50" />
              </div>

              {campusJobsLoading ? (
                <div className="text-center py-6 text-slate-500 text-sm">Loading campus jobs…</div>
              ) : campusJobs.length === 0 ? (
                <div className="bg-slate-800/40 border border-dashed border-slate-700 rounded-2xl p-8 text-center">
                  <p className="text-3xl mb-2">🏛️</p>
                  <p className="text-slate-400 font-semibold text-sm">No campus jobs posted yet</p>
                  {user?.is_recruiter && (
                    <p className="text-slate-500 text-xs mt-1">Be the first recruiter to post a campus job for {detail.short_name || selected}.</p>
                  )}
                  {user?.is_candidate && !user?.is_recruiter && (
                    <p className="text-slate-500 text-xs mt-1">Recruiters can post exclusive opportunities here for {detail.short_name || selected} students.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {campusJobs.map(job => (
                    <div key={job.id} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl px-5 py-4 flex items-center gap-4 hover:border-violet-500/40 hover:bg-slate-800 transition-all group">
                      {/* Company logo / initials */}
                      <div className="w-10 h-10 rounded-xl bg-slate-700 border border-slate-600 flex items-center justify-center shrink-0 overflow-hidden">
                        {job.company_logo_url ? (
                          <img src={job.company_logo_url} alt={job.company} className="w-8 h-8 object-contain" />
                        ) : (
                          <span className="text-xs font-black text-slate-400">{job.company[0]?.toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-bold truncate group-hover:text-violet-300 transition-colors">{job.title}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          <span className="text-slate-500 text-xs">{job.company}</span>
                          <span className="text-slate-600 text-xs">· {job.location}</span>
                          {job.employment_type && <span className="text-slate-600 text-xs">· {job.employment_type}</span>}
                          {job.remote_policy && <span className="text-slate-600 text-xs">· {job.remote_policy}</span>}
                        </div>
                        {(job.salary_range_min || job.salary_range_max) && (
                          <p className="text-emerald-400 text-xs font-semibold mt-0.5">
                            {job.salary_range_min && job.salary_range_max
                              ? `$${(job.salary_range_min / 1000).toFixed(0)}k – $${(job.salary_range_max / 1000).toFixed(0)}k`
                              : job.salary_range_min ? `From $${(job.salary_range_min / 1000).toFixed(0)}k` : `Up to $${(job.salary_range_max! / 1000).toFixed(0)}k`}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => navigate(`/jobs/${job.slug || job.id}`)}
                        className="shrink-0 text-xs font-bold text-violet-400 border border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/25 rounded-lg px-3 py-1.5 transition-all"
                      >
                        View Job
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            {(['current', 'alumni'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  activeTab === tab
                    ? `bg-gradient-to-r ${gradient} text-white shadow-lg`
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700'
                }`}
              >
                {tab === 'current' ? `📚 Current Students (${detail.current_students.length})` : `🎓 Alumni (${detail.alumni.length})`}
              </button>
            ))}
          </div>

          {/* People list */}
          {displayList.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <p className="text-4xl mb-3">{activeTab === 'current' ? '📚' : '🎓'}</p>
              <p className="font-medium">No {activeTab === 'current' ? 'current students' : 'alumni'} yet.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {displayList.map((person, idx) => (
                <CandidateRow key={person.id} person={person} idx={idx} onView={() => setViewingProfile(person)} />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (selected && detailLoading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <LoadingSpinner message="Loading college…" />
    </div>
  )

  // ── Grid view ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 py-12">

        {/* Hero */}
        <div className="text-center mb-12 relative">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <div className="w-96 h-48 bg-violet-600/10 rounded-full blur-3xl" />
          </div>
          <p className="text-sm font-bold text-violet-400 uppercase tracking-widest mb-3">College Network</p>
          <h1 className="text-4xl font-black text-white mb-3">
            Find Your{' '}
            <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
              College Community
            </span>
          </h1>
          <p className="text-slate-400 text-base max-w-lg mx-auto">
            Connect with students and alumni from your college — or discover talent pools for recruiting.
          </p>
        </div>

        {/* Stats strip */}
        {colleges.length > 0 && (
          <div className="flex justify-center gap-8 mb-10">
            {[
              { label: 'Colleges', val: colleges.length, emoji: '🏛️' },
              { label: 'Students', val: colleges.reduce((s, c) => s + c.current_students, 0), emoji: '📚' },
              { label: 'Alumni', val: colleges.reduce((s, c) => s + c.alumni, 0), emoji: '🎓' },
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-black text-white">{stat.emoji} {stat.val}</p>
                <p className="text-slate-500 text-xs mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative max-w-md mx-auto mb-10">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search colleges…"
            className="w-full pl-11 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-2xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
          />
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-2xl p-4 text-sm text-center mb-8">{error}</div>
        )}

        {colleges.length === 0 && !error && (
          <div className="text-center py-24">
            <div className="text-6xl mb-4">🏛️</div>
            <p className="text-xl font-black text-white mb-2">No colleges yet</p>
            <p className="text-slate-500 text-sm">Be the first candidate to set up your college!</p>
          </div>
        )}

        {filtered.length === 0 && colleges.length > 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-slate-400 font-medium">No colleges match "{search}"</p>
            <button onClick={() => setSearch('')} className="mt-2 text-violet-400 text-sm hover:underline">Clear search</button>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(college => (
              <CollegeCard key={college.college_name} college={college} onSelect={() => setSelected(college.college_name)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
