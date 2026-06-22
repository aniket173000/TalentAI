import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import CollegeCard from '../components/CollegeCard'
import LoadingSpinner from '../components/LoadingSpinner'
import { useAuth } from '../context/AuthContext'
import { CampusJob, CollegeCandidateEntry, CollegeDetail, CollegeInfo } from '../types'
import { formatSalaryRange } from '../utils/currency'
import { Icon } from '../components/ui'

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
        className="w-full max-w-sm bg-surface rounded-3xl border-2 border-ink overflow-hidden"
        style={{ animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)', boxShadow: '8px 8px 0 var(--violet)' }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(24px) scale(0.95); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        {/* Colored header band (white text intentional) */}
        <div className={`h-24 bg-gradient-to-br ${gradient} relative`} style={{ borderBottom: '2px solid var(--ink)' }}>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/30 flex items-center justify-center text-white hover:bg-black/50 transition-colors text-xs"
          >
            ✕
          </button>
          <div className="absolute -bottom-7 left-5">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center`} style={{ border: '2px solid var(--ink)', boxShadow: '2px 2px 0 var(--ink)' }}>
              <span className="text-xl font-black text-white">{initials}</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="pt-10 px-5 pb-6">
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, color: 'var(--ink)', letterSpacing: '-0.02em', margin: 0 }}>{person.full_name}</h2>
          <p className="text-muted text-xs mt-0.5">{collegeName}</p>

          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-7 text-center text-base">🎓</span>
              <div>
                <p className="text-muted text-[10px] uppercase tracking-wide font-bold">Batch</p>
                <p className="text-ink text-sm font-semibold">
                  {person.graduation_year
                    ? person.is_graduated ? `Class of ${person.graduation_year}` : `Graduating ${person.graduation_year}`
                    : person.is_graduated ? 'Alumni' : 'Current Student'}
                </p>
              </div>
            </div>

            {person.is_graduated && person.current_company && (
              <div className="flex items-center gap-3">
                <span className="w-7 text-center text-base">💼</span>
                <div>
                  <p className="text-muted text-[10px] uppercase tracking-wide font-bold">Currently at</p>
                  <p className="text-ink text-sm font-semibold">{person.current_company}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <span className="w-7 text-center text-base">📧</span>
              <div>
                <p className="text-muted text-[10px] uppercase tracking-wide font-bold">Email</p>
                <a href={`mailto:${person.email}`} style={{ color: 'var(--violet-ink)' }} className="text-sm font-semibold hover:underline">{person.email}</a>
              </div>
            </div>

            {person.candidate_linkedin_url && (
              <div className="flex items-center gap-3">
                <span className="w-7 text-center text-base">🔗</span>
                <div>
                  <p className="text-muted text-[10px] uppercase tracking-wide font-bold">LinkedIn</p>
                  <a
                    href={person.candidate_linkedin_url.startsWith('http') ? person.candidate_linkedin_url : `https://${person.candidate_linkedin_url}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--violet-ink)' }}
                    className="text-sm font-semibold hover:underline truncate block max-w-[220px]"
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
    <div className="rounded-2xl px-5 py-4 flex items-center gap-4 transition-all group" style={{ background: 'var(--surface)', border: '2px solid var(--line)' }}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white shrink-0 bg-gradient-to-br ${gradient}`} style={{ border: '2px solid var(--ink)' }}>
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-ink text-sm font-bold truncate">{person.full_name}</p>
        <p className="text-muted text-xs">
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
            target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
            style={{ background: 'var(--surface-2)', border: '2px solid var(--line)', color: '#0A66C2' }}
            title="LinkedIn"
          >
            in
          </a>
        )}
        <button
          onClick={onView}
          className="text-xs font-bold rounded-lg px-3 py-1.5 transition-all"
          style={{ color: 'var(--violet-ink)', background: 'var(--violet-soft)', border: '2px solid var(--violet-line)' }}
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

    // Fetch campus jobs for this college — private to recruiters and members
    // (current or past) of this college, matched across ALL education records.
    const isRecruiter = user?.is_recruiter
    const memberInstitutions = (user?.education_institutions ?? []).map(n => n.toLowerCase())
    const isMember =
      !!user?.is_candidate &&
      (memberInstitutions.includes(selected.toLowerCase()) ||
        user.college_name === selected)
    if (isRecruiter || isMember) {
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
      <div className="min-h-screen">
        {viewingProfile && (
          <ProfileModal person={viewingProfile} collegeName={selected} onClose={() => setViewingProfile(null)} />
        )}

        <div className="max-w-5xl mx-auto px-4 py-10">
          {/* Back */}
          <button
            onClick={() => { setSelected(null); setDetail(null) }}
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink mb-8 transition-colors group"
          >
            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All Colleges <span className="text-muted">/</span>
            <span className="text-ink font-semibold">{selected}</span>
          </button>

          {/* Hero card */}
          <div className={`relative rounded-3xl overflow-hidden mb-8 shadow-2xl bg-gradient-to-br ${gradient}`}>
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 70% 20%, white 0%, transparent 50%)' }} />
            <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/10" />

            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6 p-8">
              {/* Logo / badge */}
              <div className="w-20 h-20 rounded-2xl bg-surface border-2 border-ink flex items-center justify-center overflow-hidden shrink-0">
                {detail.college_logo_url && !logoErr ? (
                  <img src={detail.college_logo_url} alt={selected} className="w-14 h-14 object-contain" onError={() => setLogoErr(true)} />
                ) : (
                  <span className="text-xl font-black" style={{color:'var(--violet-ink)'}}>{badge || '🎓'}</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-black text-white leading-tight">{selected}</h1>
                {ai?.location && <p className="text-white/70 text-sm mt-0.5">📍 {ai.location}{ai.founded_year ? ` · Est. ${ai.founded_year}` : ''}</p>}
                {detail.website_url && (
                  <a href={detail.website_url.startsWith('http') ? detail.website_url : `https://${detail.website_url}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-white/60 hover:text-ink text-xs mt-1 transition-colors">
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
              <div className="bg-surface border border-line rounded-2xl p-5">
                <p className="text-xs font-bold text-muted uppercase tracking-widest mb-3">About</p>
                {ai.description && <p className="text-ink text-sm leading-relaxed mb-4">{ai.description}</p>}
                {ai.highlights.length > 0 && (
                  <ul className="space-y-2">
                    {ai.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-ink">
                        <span className="text-accent-ink mt-0.5 shrink-0">✦</span>
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
                <div className="bg-surface border border-line rounded-2xl p-5">
                  <p className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Talent Strengths</p>
                  <div className="flex flex-wrap gap-2">
                    {ai.talent_strengths.map((s, i) => (
                      <span key={i} className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:'var(--green-soft)',color:'var(--green-ink)',border:'1.5px solid var(--green-line)'}}>{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {detail.talent_stats.top_companies.length > 0 && (
                <div className="bg-surface border border-line rounded-2xl p-5">
                  <p className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Alumni Work At</p>
                  <div className="flex flex-wrap gap-2">
                    {detail.talent_stats.top_companies.map((c, i) => (
                      <span key={i} className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:'var(--cyan-soft)',color:'var(--cyan-ink)',border:'1.5px solid var(--cyan-line)'}}>🏢 {c}</span>
                    ))}
                  </div>
                </div>
              )}

              {detail.talent_stats.top_skills.length > 0 && (
                <div className="bg-surface border border-line rounded-2xl p-5">
                  <p className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Top Skills on Platform</p>
                  <div className="flex flex-wrap gap-2">
                    {detail.talent_stats.top_skills.map((s, i) => (
                      <span key={i} className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:'var(--violet-soft)',color:'var(--violet-ink)',border:'1.5px solid var(--violet-line)'}}>{s}</span>
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
                <div className="flex-1 h-px bg-line" />
                <p className="text-xs font-bold text-muted uppercase tracking-widest px-2">🏛️ Campus Hiring</p>
                <div className="flex-1 h-px bg-line" />
              </div>

              {campusJobsLoading ? (
                <div className="text-center py-6 text-muted text-sm">Loading campus jobs…</div>
              ) : campusJobs.length === 0 ? (
                <div className="bg-surface border border-dashed border-line rounded-2xl p-8 text-center">
                  <p className="text-3xl mb-2">🏛️</p>
                  <p className="text-muted font-semibold text-sm">No campus jobs posted yet</p>
                  {user?.is_recruiter && (
                    <p className="text-muted text-xs mt-1">Be the first recruiter to post a campus job for {detail.short_name || selected}.</p>
                  )}
                  {user?.is_candidate && !user?.is_recruiter && (
                    <p className="text-muted text-xs mt-1">Recruiters can post exclusive opportunities here for {detail.short_name || selected} students.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {campusJobs.map(job => (
                    <div key={job.id} className="bg-surface border border-line rounded-2xl px-5 py-4 flex items-center gap-4 hover:border-accent hover:bg-surface2 transition-all group">
                      {/* Company logo / initials */}
                      <div className="w-10 h-10 rounded-xl bg-surface2 border border-line flex items-center justify-center shrink-0 overflow-hidden">
                        {job.company_logo_url ? (
                          <img src={job.company_logo_url} alt={job.company} className="w-8 h-8 object-contain" />
                        ) : (
                          <span className="text-xs font-black text-muted">{job.company[0]?.toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-ink text-sm font-bold truncate group-hover:text-accent-ink transition-colors">{job.title}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          <span className="text-muted text-xs">{job.company}</span>
                          <span className="text-muted text-xs">· {job.location}</span>
                          {job.employment_type && <span className="text-muted text-xs">· {job.employment_type}</span>}
                          {job.remote_policy && <span className="text-muted text-xs">· {job.remote_policy}</span>}
                        </div>
                        {(job.salary_range_min || job.salary_range_max) && (
                          <p className="text-emerald-400 text-xs font-semibold mt-0.5">
                            {formatSalaryRange(job.salary_range_min, job.salary_range_max, job.salary_currency, true)}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => navigate(`/jobs/${job.slug || job.id}`)}
                        className="shrink-0 text-xs font-bold text-accent-ink border border-accent bg-accent-soft hover:opacity-80 rounded-lg px-3 py-1.5 transition-all"
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
                    : 'bg-surface2 text-muted hover:bg-surface2 hover:text-ink border border-line'
                }`}
              >
                {tab === 'current' ? `📚 Current Students (${detail.current_students.length})` : `🎓 Alumni (${detail.alumni.length})`}
              </button>
            ))}
          </div>

          {/* People list */}
          {displayList.length === 0 ? (
            <div className="text-center py-16 text-muted">
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
    <div className="min-h-screen flex items-center justify-center">
      <LoadingSpinner message="Loading college…" />
    </div>
  )

  // ── Grid view ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-8 py-12">

        {/* Hero */}
        <div className="text-center mb-10">
          <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--violet-ink)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>College Network</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 44, letterSpacing: '-0.035em', color: 'var(--ink)', margin: '0 0 12px', lineHeight: 1.04 }}>
            Find your college community
          </h1>
          <p className="max-w-lg mx-auto" style={{ color: 'var(--muted)', fontSize: 16, fontWeight: 500, lineHeight: 1.5 }}>
            Connect with students and alumni from your college — or discover talent pools for recruiting.
          </p>
        </div>

        {/* Stats strip */}
        {colleges.length > 0 && (
          <div className="flex justify-center gap-10 mb-10">
            {[
              { label: 'Colleges', val: colleges.length, emoji: '🏛️' },
              { label: 'Students', val: colleges.reduce((s, c) => s + c.current_students, 0), emoji: '📚' },
              { label: 'Alumni', val: colleges.reduce((s, c) => s + c.alumni, 0), emoji: '🎓' },
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--ink)', margin: 0 }}>{stat.emoji} {stat.val}</p>
                <p style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600, marginTop: 2 }}>{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="max-w-md mx-auto mb-10" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 16px', background: 'var(--surface)', border: '2px solid var(--ink)', borderRadius: 16, boxShadow: '3px 3px 0 var(--card-shadow)' }}>
          <Icon name="search" size={18} stroke={2.2} style={{ color: 'var(--muted)' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search colleges…"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 14.5, color: 'var(--ink)', width: '100%' }} />
        </div>

        {error && (
          <div style={{ background: 'var(--red-soft)', border: '1.5px solid var(--red-line)', color: 'var(--red-ink)' }} className="rounded-2xl p-4 text-sm text-center mb-8 font-medium">{error}</div>
        )}

        {colleges.length === 0 && !error && (
          <div className="text-center py-24">
            <div className="text-6xl mb-4">🏛️</div>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--ink)', margin: '0 0 6px' }}>No colleges yet</p>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Be the first candidate to set up your college!</p>
          </div>
        )}

        {filtered.length === 0 && colleges.length > 0 && (
          <div className="text-center py-16" style={{ color: 'var(--muted)' }}>
            <div className="text-4xl mb-3">🔍</div>
            <p className="font-medium">No colleges match "{search}"</p>
            <button onClick={() => setSearch('')} style={{ color: 'var(--violet-ink)', fontWeight: 700 }} className="mt-2 text-sm hover:underline">Clear search</button>
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
