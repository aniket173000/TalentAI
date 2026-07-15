import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import CollegeCard from '../components/CollegeCard'
import LoadingSpinner from '../components/LoadingSpinner'
import { useAuth } from '../context/AuthContext'
import { CampusJob, CollegeCandidateEntry, CollegeDetail, CollegeInfo } from '../types'
import { formatSalaryRange } from '../utils/currency'
import { THEMES, MODES, PALETTES, hexA, brandOf, readableAccent, type CampusMode, type Palette, type Theme, type ThemeMode } from './collegesTheme'

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

function ProfileModal({ person, collegeName, accent, T, onClose }: {
  person: CollegeCandidateEntry
  collegeName: string
  accent: string
  T: Theme
  onClose: () => void
}) {
  const gradient = SCHEME_GRADIENTS[hashStr(person.full_name) % SCHEME_GRADIENTS.length]
  const initials = person.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  const Field = ({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 28, textAlign: 'center', fontSize: 16 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: T.faint2, margin: 0 }}>{label}</p>
        <div style={{ color: T.text, fontSize: 14, fontWeight: 600, marginTop: 1 }}>{children}</div>
      </div>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: T.overlay, backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[90vh] overflow-y-auto my-auto"
        style={{ background: T.cardGrad, borderRadius: 18, border: `1px solid ${T.border2}`, fontFamily: T.font, animation: 'mtSlideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)', boxShadow: `0 24px 60px -12px ${T.shadowStrong}` }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`@keyframes mtSlideUp { from { opacity:0; transform:translateY(24px) scale(.95); } to { opacity:1; transform:none; } }`}</style>

        {/* Colored header band (white text intentional) */}
        <div className={`h-24 bg-gradient-to-br ${gradient} relative`} style={{ borderBottom: `1px solid ${T.border2}` }}>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/30 flex items-center justify-center text-white hover:bg-black/50 transition-colors text-xs"
          >
            ✕
          </button>
          <div className="absolute -bottom-7 left-5">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center`} style={{ border: `2px solid ${T.bg}`, boxShadow: `0 8px 20px -6px ${T.shadowCard}` }}>
              <span className="text-xl font-black text-white">{initials}</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="pt-10 px-5 pb-6">
          <h2 style={{ fontWeight: 700, fontSize: 20, color: T.text, letterSpacing: '-0.02em', margin: 0 }}>{person.full_name}</h2>
          <p style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: T.faint, marginTop: 4 }}>{collegeName}</p>

          <div className="mt-4 space-y-3">
            <Field icon="🎓" label="Batch">
              {person.graduation_year
                ? person.is_graduated ? `Class of ${person.graduation_year}` : `Graduating ${person.graduation_year}`
                : person.is_graduated ? 'Alumni' : 'Current Student'}
            </Field>

            {person.is_graduated && person.current_company && (
              <Field icon="💼" label="Currently at">{person.current_company}</Field>
            )}

            <Field icon="📧" label="Email">
              <a href={`mailto:${person.email}`} style={{ color: accent }} className="hover:underline">{person.email}</a>
            </Field>

            {person.candidate_linkedin_url && (
              <Field icon="🔗" label="LinkedIn">
                <a
                  href={person.candidate_linkedin_url.startsWith('http') ? person.candidate_linkedin_url : `https://${person.candidate_linkedin_url}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: accent }}
                  className="hover:underline truncate block max-w-[220px]"
                >
                  {person.candidate_linkedin_url.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '').replace(/\/$/, '') || 'View Profile'}
                </a>
              </Field>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Candidate row card ───────────────────────────────────────────────────────

function CandidateRow({ person, idx, accent, T, onView }: { person: CollegeCandidateEntry; idx: number; accent: string; T: Theme; onView: () => void }) {
  const gradient = SCHEME_GRADIENTS[(hashStr(person.full_name) + idx) % SCHEME_GRADIENTS.length]
  const initials = person.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="flex items-center gap-4" style={{ background: T.cardGrad, border: `1px solid ${T.border2}`, borderRadius: 14, padding: '14px 18px' }}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white shrink-0 bg-gradient-to-br ${gradient}`} style={{ border: `1px solid ${T.border3}` }}>
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate" style={{ color: T.text, fontSize: 14, fontWeight: 700 }}>{person.full_name}</p>
        <p style={{ fontFamily: T.mono, fontSize: 11, color: T.faint, marginTop: 2 }}>
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
            style={{ background: T.chipBg, border: `1px solid ${T.chipLine}`, color: T.linkedin }}
            title="LinkedIn"
          >
            in
          </a>
        )}
        <button
          onClick={onView}
          className="text-xs font-bold rounded-lg px-3 py-1.5 transition-all"
          style={{ color: accent, background: hexA(accent, 0.12), border: `1px solid ${hexA(accent, 0.4)}` }}
        >
          View Profile
        </button>
      </div>
    </div>
  )
}

// ── Accent palette picker (Midnight Terminal stakeholder feature) ─────────────

function PalettePicker({ palette, mode, T, onPick }: {
  palette: Palette
  mode: CampusMode
  T: Theme
  onPick: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const swatch = (p: Palette, size: number) => (
    <span style={{ display: 'inline-flex', borderRadius: 999, overflow: 'hidden', border: `1px solid ${T.border3}` }}>
      <span style={{ width: size, height: size, background: p.candidate }} />
      <span style={{ width: size, height: size, background: p.recruiter }} />
    </span>
  )

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', cursor: 'pointer',
          background: T.surface, border: `1px solid ${T.border3}`, borderRadius: 11,
          fontFamily: T.mono, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: T.muted,
        }}
        title="Switch accent palette"
      >
        {swatch(palette, 12)}
        <span>{palette.name}</span>
        <span style={{ color: T.faint2 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 30, width: 210,
          background: T.panel, border: `1px solid ${T.border3}`, borderRadius: 12, padding: 6,
          boxShadow: `0 18px 40px -12px ${T.shadowStrong}`,
        }}>
          {PALETTES.map(p => {
            const active = p.name === palette.name
            return (
              <button
                key={p.name}
                onClick={() => { onPick(p.name); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px',
                  cursor: 'pointer', border: 'none', borderRadius: 8, textAlign: 'left',
                  background: active ? T.chipBg : 'transparent',
                  fontFamily: T.mono, fontSize: 12, color: active ? T.text : T.muted,
                }}
              >
                {swatch(p, 13)}
                <span style={{ flex: 1 }}>{p.name}</span>
                {active && <span style={{ color: mode === 'recruiter' ? p.recruiter : p.candidate }}>●</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Theme toggle (dark / light) ───────────────────────────────────────────────

function ThemeToggle({ theme, T, onToggle }: { theme: ThemeMode; T: Theme; onToggle: () => void }) {
  const isDark = theme === 'dark'
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer',
        background: T.surface, border: `1px solid ${T.border3}`, borderRadius: 11,
        fontFamily: T.mono, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: T.muted,
        transition: 'background .15s, border-color .15s',
      }}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span style={{ fontSize: 13, lineHeight: 1 }}>{isDark ? '☀️' : '🌙'}</span>
      <span>{isDark ? 'Light' : 'Dark'}</span>
    </button>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Colleges() {
  const navigate = useNavigate()
  // Role gating is by ACTIVE MODE (mode-aware flags), consistent with the rest
  // of the app — a dual-mode user in candidate mode must not see recruiter
  // actions (e.g. "Post a Campus Job"), and vice versa.
  const { user, activeMode, isRecruiter, isCandidate } = useAuth()
  const [colleges, setColleges] = useState<CollegeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [counters, setCounters] = useState({ a: 0, b: 0, c: 0 })
  const [paletteName, setPaletteName] = useState(
    () => localStorage.getItem('campus_palette') || PALETTES[0].name
  )
  const [theme, setTheme] = useState<ThemeMode>(
    () => (localStorage.getItem('campus_theme') === 'light' ? 'light' : 'dark')
  )
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

    // Fetch campus jobs for this college — visible to recruiters (recruiter mode)
    // and to candidate members (candidate mode) of this college, matched across
    // ALL education records. Gated by active mode so the data only loads for the
    // role that's allowed to see it.
    const memberInstitutions = (user?.education_institutions ?? []).map(n => n.toLowerCase())
    const isMember =
      isCandidate &&
      (memberInstitutions.includes(selected.toLowerCase()) ||
        user?.college_name === selected)
    if (isRecruiter || isMember) {
      setCampusJobsLoading(true)
      api
        .get<CampusJob[]>(`/colleges/${encodeURIComponent(selected)}/campus-jobs`)
        .then(r => setCampusJobs(r.data))
        .catch(() => setCampusJobs([]))
        .finally(() => setCampusJobsLoading(false))
    }
  }, [selected, user, activeMode, isRecruiter, isCandidate])

  // Animated stat counters: count up 0 → target over 1100ms, ease-out cubic.
  useEffect(() => {
    if (colleges.length === 0) return
    const target = {
      a: colleges.length,
      b: colleges.reduce((s, c) => s + c.current_students, 0),
      c: colleges.reduce((s, c) => s + c.alumni, 0),
    }
    const dur = 1100, t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      setCounters({ a: Math.round(target.a * e), b: Math.round(target.b * e), c: Math.round(target.c * e) })
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [colleges])

  const ql = search.trim().toLowerCase()
  const filtered = colleges.filter(c =>
    !ql || c.college_name.toLowerCase().includes(ql) || (c.short_name?.toLowerCase().includes(ql) ?? false)
  )

  // Mode (candidate/recruiter) drives copy + accent; recruiters see recruiter copy.
  const mode: CampusMode = activeMode === 'recruiter' ? 'recruiter' : 'candidate'
  const M = MODES[mode]
  const T = THEMES[theme]
  const palette = PALETTES.find(p => p.name === paletteName) ?? PALETTES[0]
  const rawAccent = mode === 'recruiter' ? palette.recruiter : palette.candidate
  // Light mode darkens the neon palette accent so it reads as text/links and
  // carries white button text; dark mode keeps the raw neon.
  const accent = readableAccent(rawAccent, theme)
  const accentGlow = hexA(accent, T.glowAlpha)
  const maxTotal = Math.max(1, ...colleges.map(c => c.total))
  const pickPalette = (name: string) => { setPaletteName(name); localStorage.setItem('campus_palette', name) }
  const toggleTheme = () => setTheme(t => {
    const next: ThemeMode = t === 'dark' ? 'light' : 'dark'
    localStorage.setItem('campus_theme', next)
    return next
  })
  const fmt = (n: number) => n.toLocaleString('en-US')

  if (loading) return (
    <div style={{ minHeight: '100vh', background: T.bg, backgroundImage: T.grid, backgroundSize: '26px 26px' }}>
      <div className="max-w-6xl mx-auto px-4 py-24"><LoadingSpinner message="Loading colleges…" /></div>
    </div>
  )

  // ── Detail view — Midnight Terminal ───────────────────────────────────────────
  if (selected && detail) {
    const brand = brandOf(selected)
    const brandTint = hexA(brand, 0.14)
    const badge = detail.short_name || selected.split(/[\s,]+/).filter(w => /^[A-Z]/i.test(w)).map(w => w[0].toUpperCase()).slice(0, 4).join('')
    const displayList = activeTab === 'current' ? detail.current_students : detail.alumni
    const ai = detail.ai_info

    // Shared styles for the dark info panels + mono section labels + tag chips.
    const panel: React.CSSProperties = { background: T.surface, border: `1px solid ${T.border2}`, borderRadius: 16, padding: 20 }
    const sectionLabel: React.CSSProperties = { fontFamily: T.mono, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: T.faint, margin: '0 0 12px' }
    const chip = (color: string): React.CSSProperties => ({ fontFamily: T.mono, fontSize: 11, fontWeight: 500, padding: '5px 10px', borderRadius: 8, background: T.chipBg, border: `1px solid ${T.chipLine}`, color })

    return (
      <div style={{ minHeight: '100vh', background: T.bg, backgroundImage: T.grid, backgroundSize: '26px 26px', color: T.text, fontFamily: T.font, WebkitFontSmoothing: 'antialiased' }}>
        {viewingProfile && (
          <ProfileModal person={viewingProfile} collegeName={selected} accent={accent} T={T} onClose={() => setViewingProfile(null)} />
        )}

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 28px 90px' }}>
          {/* Back + theme toggle */}
          <div className="flex items-center justify-between gap-3 mb-8">
            <button
              onClick={() => { setSelected(null); setDetail(null) }}
              className="inline-flex items-center gap-2 group"
              style={{ fontFamily: T.mono, fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', color: T.faint, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span style={{ color: accent }}>◀ all colleges</span>
              <span style={{ opacity: 0.4 }}>/</span>
              <span style={{ color: T.text }}>{selected}</span>
            </button>
            <ThemeToggle theme={theme} T={T} onToggle={toggleTheme} />
          </div>

          {/* Hero card */}
          <div style={{ position: 'relative', background: T.cardGrad, border: `1px solid ${T.border2}`, borderRadius: 18, overflow: 'hidden', marginBottom: 28 }}>
            <div style={{ height: 4, background: brand }} />
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6" style={{ padding: 28 }}>
              {/* Logo / monogram tile */}
              <div style={{ width: 80, height: 80, borderRadius: 18, background: brandTint, border: `1px solid ${brand}`, display: 'grid', placeItems: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {detail.college_logo_url && !logoErr ? (
                  <img src={detail.college_logo_url} alt={selected} className="object-contain" style={{ width: 52, height: 52 }} onError={() => setLogoErr(true)} />
                ) : (
                  <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 20, color: brand }}>{badge || '🎓'}</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h1 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.05, margin: 0 }}>{selected}</h1>
                {ai?.location && (
                  <p style={{ fontFamily: T.mono, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: T.muted, marginTop: 8 }}>
                    📍 {ai.location}{ai.founded_year ? ` · est. ${ai.founded_year}` : ''}
                  </p>
                )}
                {detail.website_url && (
                  <a href={detail.website_url.startsWith('http') ? detail.website_url : `https://${detail.website_url}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: T.mono, fontSize: 12, color: T.faint, marginTop: 4, display: 'inline-block' }}
                    className="hover:underline">
                    🔗 {detail.website_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                  </a>
                )}
                <div className="flex flex-wrap gap-2" style={{ marginTop: 14 }}>
                  <span style={chip(T.chipText)}><b style={{ color: T.chipTextStrong }}>{detail.current_students.length}</b> {M.chipA}</span>
                  <span style={chip(T.chipText)}><b style={{ color: T.chipTextStrong }}>{detail.alumni.length}</b> {M.chipB}</span>
                  <span style={chip(T.chipText)}><b style={{ color: T.chipTextStrong }}>{detail.current_students.length + detail.alumni.length}</b> total</span>
                </div>
              </div>
            </div>
          </div>

          {/* Two-column layout: AI info + Talent stats */}
          <div className="grid gap-4 sm:grid-cols-2" style={{ marginBottom: 28 }}>

            {/* About */}
            {ai && (ai.description || ai.highlights.length > 0) && (
              <div style={panel}>
                <p style={sectionLabel}>// about</p>
                {ai.description && <p style={{ color: T.text, fontSize: 14, lineHeight: 1.6, marginBottom: ai.highlights.length ? 16 : 0 }}>{ai.description}</p>}
                {ai.highlights.length > 0 && (
                  <ul className="space-y-2" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {ai.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2" style={{ fontSize: 14, color: T.text }}>
                        <span style={{ color: accent, marginTop: 1, flexShrink: 0 }}>✦</span>
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
                <div style={panel}>
                  <p style={sectionLabel}>// talent strengths</p>
                  <div className="flex flex-wrap gap-2">
                    {ai.talent_strengths.map((s, i) => <span key={i} style={chip(accent)}>{s}</span>)}
                  </div>
                </div>
              )}

              {detail.talent_stats.top_companies.length > 0 && (
                <div style={panel}>
                  <p style={sectionLabel}>// alumni work at</p>
                  <div className="flex flex-wrap gap-2">
                    {detail.talent_stats.top_companies.map((c, i) => <span key={i} style={chip(T.accentBlue)}>🏢 {c}</span>)}
                  </div>
                </div>
              )}

              {detail.talent_stats.top_skills.length > 0 && (
                <div style={panel}>
                  <p style={sectionLabel}>// top skills on platform</p>
                  <div className="flex flex-wrap gap-2">
                    {detail.talent_stats.top_skills.map((s, i) => <span key={i} style={chip(T.accentPurple)}>{s}</span>)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Recruiter CTA — recruiter mode only (posting a job is a recruiter action) */}
          {isRecruiter && (
            <div className="flex items-center justify-between gap-4" style={{ background: T.cardGrad, border: `1px solid ${T.border2}`, borderLeft: `3px solid ${brand}`, borderRadius: 14, padding: 20, marginBottom: 28 }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>🎯 Recruiting from {detail.short_name || selected}?</p>
                <p style={{ color: T.muted, fontSize: 13, marginTop: 4 }}>Post a campus job — only candidates from this college will see it.</p>
              </div>
              <button
                onClick={() => navigate(`/recruiter/jobs/create?campus=${encodeURIComponent(selected)}`)}
                className="shrink-0"
                style={{ border: 'none', borderRadius: 10, background: accent, color: T.onAccent, fontFamily: T.font, fontWeight: 700, fontSize: 13, padding: '10px 16px', cursor: 'pointer', boxShadow: `0 0 22px ${accentGlow}` }}
              >
                Post a Campus Job →
              </button>
            </div>
          )}

          {/* Campus Hiring section — recruiters (recruiter mode) + candidate members of this college */}
          {(isRecruiter || (isCandidate && user?.college_name === selected)) && (
            <div style={{ marginBottom: 28 }}>
              <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
                <div className="flex-1" style={{ height: 1, background: T.border }} />
                <p style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: T.faint, padding: '0 8px', margin: 0 }}>🏛️ campus hiring</p>
                <div className="flex-1" style={{ height: 1, background: T.border }} />
              </div>

              {campusJobsLoading ? (
                <div className="text-center" style={{ padding: '24px 0', color: T.faint, fontFamily: T.mono, fontSize: 13 }}>loading campus jobs…</div>
              ) : campusJobs.length === 0 ? (
                <div className="text-center" style={{ border: `1px dashed ${T.dashed}`, borderRadius: 16, padding: 32 }}>
                  <p style={{ fontSize: 28, margin: '0 0 8px' }}>🏛️</p>
                  <p style={{ color: T.muted, fontWeight: 600, fontSize: 14, margin: 0 }}>No campus jobs posted yet</p>
                  {isRecruiter && (
                    <>
                      <p style={{ color: T.faint, fontSize: 12, marginTop: 4, marginBottom: 16 }}>Be the first to post an exclusive opportunity for {detail.short_name || selected} students.</p>
                      <button
                        onClick={() => navigate(`/recruiter/jobs/create?campus=${encodeURIComponent(selected)}`)}
                        style={{ fontFamily: T.font, fontSize: 13, fontWeight: 700, padding: '10px 20px', borderRadius: 10, background: accent, color: T.onAccent, border: 'none', cursor: 'pointer', boxShadow: `0 0 18px ${accentGlow}` }}
                      >
                        Post a Campus Job →
                      </button>
                    </>
                  )}
                  {isCandidate && (
                    <p style={{ color: T.faint, fontSize: 12, marginTop: 4 }}>Recruiters can post exclusive opportunities here for {detail.short_name || selected} students.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {campusJobs.map(job => (
                    <div key={job.id} className="flex items-center gap-4" style={{ background: T.cardGrad, border: `1px solid ${T.border2}`, borderRadius: 14, padding: '14px 18px' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: T.chipBg, border: `1px solid ${T.chipLine}`, display: 'grid', placeItems: 'center', flexShrink: 0, overflow: 'hidden' }}>
                        {job.company_logo_url ? (
                          <img src={job.company_logo_url} alt={job.company} style={{ width: 28, height: 28, objectFit: 'contain' }} />
                        ) : (
                          <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 13, color: T.muted }}>{job.company[0]?.toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate" style={{ color: T.text, fontSize: 14, fontWeight: 700, margin: 0 }}>{job.title}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5" style={{ fontFamily: T.mono, fontSize: 11, color: T.faint, marginTop: 3 }}>
                          <span>{job.company}</span>
                          <span>· {job.location}</span>
                          {job.employment_type && <span>· {job.employment_type}</span>}
                          {job.remote_policy && <span>· {job.remote_policy}</span>}
                        </div>
                        {(job.salary_range_min || job.salary_range_max) && (
                          <p style={{ color: T.success, fontFamily: T.mono, fontSize: 11, fontWeight: 500, marginTop: 3 }}>
                            {formatSalaryRange(job.salary_range_min, job.salary_range_max, job.salary_currency, true)}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => navigate(`/jobs/${job.slug || job.id}`)}
                        className="shrink-0"
                        style={{ fontSize: 12, fontWeight: 700, color: accent, background: hexA(accent, 0.12), border: `1px solid ${hexA(accent, 0.4)}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
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
          <div className="flex gap-2" style={{ marginBottom: 24 }}>
            {(['current', 'alumni'] as const).map(tab => {
              const active = activeTab === tab
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    fontFamily: T.font, transition: 'all .15s',
                    background: active ? accent : T.surface, color: active ? T.onAccent : T.muted,
                    border: active ? 'none' : `1px solid ${T.border3}`,
                  }}
                >
                  {tab === 'current' ? `📚 Current Students (${detail.current_students.length})` : `🎓 Alumni (${detail.alumni.length})`}
                </button>
              )
            })}
          </div>

          {/* People list */}
          {displayList.length === 0 ? (
            <div className="text-center" style={{ padding: '64px 0', color: T.faint }}>
              <p style={{ fontSize: 32, margin: '0 0 12px' }}>{activeTab === 'current' ? '📚' : '🎓'}</p>
              <p style={{ fontFamily: T.mono, fontSize: 13 }}>// no {activeTab === 'current' ? 'current students' : 'alumni'} yet</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {displayList.map((person, idx) => (
                <CandidateRow key={person.id} person={person} idx={idx} accent={accent} T={T} onView={() => setViewingProfile(person)} />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (selected && detailLoading) return (
    <div style={{ minHeight: '100vh', background: T.bg, backgroundImage: T.grid, backgroundSize: '26px 26px' }}
      className="flex items-center justify-center">
      <LoadingSpinner message="Loading college…" />
    </div>
  )

  // ── Grid view — Midnight Terminal ─────────────────────────────────────────────
  const statPanels = [
    { val: fmt(counters.a), label: 'Colleges', accent: false },
    { val: fmt(counters.b), label: M.lab2, accent: true },
    { val: fmt(counters.c), label: M.lab3, accent: false },
  ]

  return (
    <div style={{
      minHeight: '100vh', background: T.bg, backgroundImage: T.grid, backgroundSize: '26px 26px',
      color: T.text, fontFamily: T.font, WebkitFontSmoothing: 'antialiased',
    }}>
      <style>{`
        @keyframes mtBlink { 0%,49% { opacity:1; } 50%,100% { opacity:0; } }
        @keyframes mtRise { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:none; } }
        .mt-card { animation: mtRise .5s cubic-bezier(.2,.7,.2,1) both; }
        .mt-search input::placeholder { color:${T.placeholder}; }
        .mt-search input::selection { background:${accent}; color:${T.onAccent}; }
      `}</style>

      <main style={{ maxWidth: 1240, margin: '0 auto', padding: '56px 28px 90px' }}>
        {/* Theme toggle + accent palette picker (stakeholder features) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 18 }}>
          <ThemeToggle theme={theme} T={T} onToggle={toggleTheme} />
          <PalettePicker palette={palette} mode={mode} T={T} onPick={pickPalette} />
        </div>

        {/* Hero + stats */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 720 }}>
            <div style={{ fontFamily: T.mono, fontSize: 12, letterSpacing: '.18em', textTransform: 'uppercase', color: accent, marginBottom: 18 }}>
              $ nideknil --campus 2026
            </div>
            <h1 style={{ fontSize: 'clamp(40px,6vw,72px)', lineHeight: 1, letterSpacing: '-.03em', fontWeight: 700, margin: 0 }}>
              {M.headline}
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.5, color: T.muted, maxWidth: 560, margin: '22px 0 0' }}>
              {M.sub}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {statPanels.map(s => (
              <div key={s.label} style={{ padding: '18px 22px', border: `1px solid ${T.statBorder}`, borderRadius: 14, background: T.panelGrad, minWidth: 108 }}>
                <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 30, lineHeight: 1, color: s.accent ? accent : T.text }}>{s.val}</div>
                <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: T.faint, marginTop: 8 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Terminal search */}
        <div className="mt-search" style={{
          position: 'relative', margin: '44px 0 38px', display: 'flex', alignItems: 'center', gap: 12,
          border: `1px solid ${T.border3}`, borderRadius: 14, background: T.panel, padding: '4px 16px',
        }}>
          <span style={{ fontFamily: T.mono, fontSize: 18, color: accent }}>&gt;</span>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search colleges, codes…"
            style={{ flex: 1, border: 'none', background: 'transparent', padding: '16px 0', fontFamily: T.mono, fontSize: 16, color: T.text, outline: 'none' }}
          />
          {colleges.length > 0 && (
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.placeholder }}>{filtered.length}/{colleges.length}</span>
          )}
          <span style={{ width: 9, height: 18, background: accent, animation: 'mtBlink 1.1s steps(1) infinite' }} />
        </div>

        {error && (
          <div style={{ border: `1px solid ${T.border3}`, background: T.panel, color: T.danger, fontFamily: T.mono, fontSize: 13 }}
            className="rounded-2xl p-4 text-center mb-8">// {error}</div>
        )}

        {colleges.length === 0 && !error && (
          <div style={{ border: `1px dashed ${T.dashed}`, borderRadius: 16, padding: 60, textAlign: 'center' }}>
            <div style={{ fontFamily: T.mono, fontSize: 13, letterSpacing: '.1em', color: T.faint }}>// no campuses on the platform yet</div>
            <p style={{ color: T.faint2, fontSize: 13, marginTop: 10 }}>Be the first candidate to set up your campus.</p>
          </div>
        )}

        {/* Empty search state */}
        {filtered.length === 0 && colleges.length > 0 && (
          <div style={{ border: `1px dashed ${T.dashed}`, borderRadius: 16, padding: 60, textAlign: 'center' }}>
            <div style={{ fontFamily: T.mono, fontSize: 13, letterSpacing: '.1em', color: T.faint }}>// no campuses match “{search}”</div>
            <button
              onClick={() => setSearch('')}
              style={{ marginTop: 18, border: 'none', borderRadius: 10, background: accent, color: T.onAccent, fontFamily: T.font, fontWeight: 700, fontSize: 14, padding: '11px 18px', cursor: 'pointer' }}
            >
              Clear search
            </button>
          </div>
        )}

        {/* Card grid */}
        {filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(330px,100%),1fr))', gap: 20 }}>
            {filtered.map((college, i) => (
              <div key={college.college_name} className="mt-card" style={{ animationDelay: `${0.02 + i * 0.06}s` }}>
                <CollegeCard
                  college={college}
                  T={T}
                  accent={accent}
                  accentGlow={accentGlow}
                  fill={college.total / maxTotal}
                  chipA={M.chipA}
                  chipB={M.chipB}
                  cta={M.cta}
                  onSelect={() => setSelected(college.college_name)}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      <footer style={{ borderTop: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '18px 28px', display: 'flex', justifyContent: 'space-between', fontFamily: T.mono, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: T.faint }}>
          <span>Nideknil © 2026</span>
          <span style={{ color: accent }}>campus hiring, leveled up.</span>
        </div>
      </footer>
    </div>
  )
}
