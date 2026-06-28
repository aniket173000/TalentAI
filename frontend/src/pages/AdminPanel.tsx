import { useEffect, useState } from 'react'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'

// ── Types ───────────────────────────────────────────────────────────────────
interface Overview {
  users: { total: number; candidates: number; recruiters: number; dual_mode: number; verified: number; new_7d: number }
  jobs: { total: number; by_status: Record<string, number>; new_7d: number }
  applications: { total: number; by_status: Record<string, number>; new_7d: number }
  referrals: { posts: number; applications: number }
  colleges: { total: number }
  feedback: { total: number; by_category: Record<string, number>; by_priority: Record<string, number>; open_bugs: number }
  revenue: number | null
}
interface FeedbackItem {
  id: number; name: string | null; email: string | null; mood: string | null
  category: string; summary: string; priority: string; sentiment: string
  affected_area: string; raw_text: string; created_at: string | null
}
interface UserRow {
  id: number; full_name: string; email: string; phone: string | null
  is_candidate: boolean; is_recruiter: boolean; email_verified: boolean; created_at: string | null
}
interface JobRow {
  id: number; title: string; company: string; status: string
  is_campus_hiring: boolean; applicants: number; created_at: string | null
}

const CAT_META: Record<string, { emoji: string; color: string; bg: string }> = {
  bug:             { emoji: '🐛', color: '#dc2626', bg: '#fef2f2' },
  feature_request: { emoji: '💡', color: '#7c3aed', bg: '#f5f3ff' },
  ui_ux:           { emoji: '🎨', color: '#0284c7', bg: '#f0f9ff' },
  performance:     { emoji: '⚡', color: '#d97706', bg: '#fffbeb' },
  praise:          { emoji: '❤️',  color: '#db2777', bg: '#fdf2f8' },
  question:        { emoji: '❓', color: '#6b7280', bg: '#f9fafb' },
  security:        { emoji: '🔒', color: '#1d4ed8', bg: '#eff6ff' },
  other:           { emoji: '💬', color: '#374151', bg: '#f9fafb' },
}
const PRIORITY_COLOR: Record<string, string> = { high: '#dc2626', medium: '#d97706', low: '#6b7280' }

function fmtDate(s: string | null): string {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return s }
}

// ── Small UI atoms ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: string }) {
  return (
    <div className="bg-surface rounded-2xl border-2 border-ink shadow-card p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-1.5 font-extrabold text-ink" style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: accent ?? 'var(--ink)' }}>{value}</p>
      {sub && <p className="text-xs text-muted font-medium mt-0.5">{sub}</p>}
    </div>
  )
}

function Pills({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, n]) => n > 0)
  if (entries.length === 0) return <span className="text-xs text-muted">none</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, n]) => (
        <span key={k} className="text-xs font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1">
          {k.replace(/_/g, ' ')}: <span className="font-bold text-ink">{n}</span>
        </span>
      ))}
    </div>
  )
}

type Tab = 'overview' | 'feedback' | 'users' | 'jobs'

export default function AdminPanel() {
  const [tab, setTab] = useState<Tab>('overview')
  const [ov, setOv] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [feedbackCat, setFeedbackCat] = useState<string>('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [userQuery, setUserQuery] = useState('')
  const [jobs, setJobs] = useState<JobRow[]>([])

  useEffect(() => {
    setLoading(true)
    api.get<Overview>('/admin/overview')
      .then(r => setOv(r.data))
      .catch(e => setErr(e?.response?.status === 403 ? 'You do not have admin access.' : 'Failed to load admin data.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (tab !== 'feedback') return
    api.get<{ items: FeedbackItem[] }>('/admin/feedback', { params: feedbackCat ? { category: feedbackCat } : {} })
      .then(r => setFeedback(r.data.items)).catch(() => setFeedback([]))
  }, [tab, feedbackCat])

  useEffect(() => {
    if (tab !== 'users') return
    const t = setTimeout(() => {
      api.get<{ items: UserRow[] }>('/admin/users', { params: userQuery ? { q: userQuery } : {} })
        .then(r => setUsers(r.data.items)).catch(() => setUsers([]))
    }, 250)
    return () => clearTimeout(t)
  }, [tab, userQuery])

  useEffect(() => {
    if (tab !== 'jobs') return
    api.get<{ items: JobRow[] }>('/admin/jobs')
      .then(r => setJobs(r.data.items)).catch(() => setJobs([]))
  }, [tab])

  if (loading) return <div className="py-20"><LoadingSpinner /></div>
  if (err) return <div className="max-w-3xl mx-auto px-6 py-20 text-center text-muted font-semibold">{err}</div>

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'feedback', label: 'Feedback', icon: '💬' },
    { key: 'users', label: 'Users', icon: '👥' },
    { key: 'jobs', label: 'Jobs', icon: '💼' },
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="font-extrabold text-ink" style={{ fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: '-0.03em' }}>Admin Panel</h1>
        <p className="text-muted text-sm mt-1">Everything happening across Nideknil, in one place.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-7 border-b-2 border-line overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2.5 text-sm font-bold transition-colors whitespace-nowrap -mb-0.5 border-b-2"
            style={tab === t.key
              ? { color: 'var(--ink)', borderColor: 'var(--violet)' }
              : { color: 'var(--muted)', borderColor: 'transparent' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && ov && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Users" value={ov.users.total} sub={`+${ov.users.new_7d} this week`} />
            <StatCard label="Jobs" value={ov.jobs.total} sub={`+${ov.jobs.new_7d} this week`} />
            <StatCard label="Applications" value={ov.applications.total} sub={`+${ov.applications.new_7d} this week`} />
            <StatCard label="Open Bugs" value={ov.feedback.open_bugs} accent={ov.feedback.open_bugs > 0 ? '#dc2626' : undefined} sub="from feedback" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface rounded-2xl border-2 border-ink shadow-card p-5 space-y-3">
              <h3 className="font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>Users breakdown</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted">Candidates</span><p className="font-bold text-ink text-lg">{ov.users.candidates}</p></div>
                <div><span className="text-muted">Recruiters</span><p className="font-bold text-ink text-lg">{ov.users.recruiters}</p></div>
                <div><span className="text-muted">Dual-mode</span><p className="font-bold text-ink text-lg">{ov.users.dual_mode}</p></div>
                <div><span className="text-muted">Email verified</span><p className="font-bold text-ink text-lg">{ov.users.verified}</p></div>
              </div>
            </div>
            <div className="bg-surface rounded-2xl border-2 border-ink shadow-card p-5 space-y-3">
              <h3 className="font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>Jobs by status</h3>
              <Pills data={ov.jobs.by_status} />
              <h3 className="font-bold text-ink pt-2" style={{ fontFamily: 'var(--font-display)' }}>Applications by status</h3>
              <Pills data={ov.applications.by_status} />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Referral Posts" value={ov.referrals.posts} />
            <StatCard label="Referral Applications" value={ov.referrals.applications} />
            <StatCard label="Colleges" value={ov.colleges.total} />
            <StatCard label="Revenue" value={ov.revenue == null ? '—' : `₹${ov.revenue}`} sub={ov.revenue == null ? 'billing not set up yet' : undefined} />
          </div>

          <div className="bg-surface rounded-2xl border-2 border-ink shadow-card p-5 space-y-3">
            <h3 className="font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>Feedback triage</h3>
            <Pills data={ov.feedback.by_category} />
            <p className="text-xs text-muted">Total feedback received: <span className="font-bold text-ink">{ov.feedback.total}</span></p>
          </div>
        </div>
      )}

      {/* ── Feedback ── */}
      {tab === 'feedback' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setFeedbackCat('')}
              className="text-xs font-bold rounded-full px-3 py-1.5 border-2 transition"
              style={feedbackCat === '' ? { borderColor: 'var(--ink)', background: 'var(--ink)', color: 'var(--bg)' } : { borderColor: 'var(--line)', color: 'var(--muted)' }}>
              All
            </button>
            {Object.keys(CAT_META).map(c => (
              <button key={c} onClick={() => setFeedbackCat(c)}
                className="text-xs font-bold rounded-full px-3 py-1.5 border-2 transition capitalize"
                style={feedbackCat === c ? { borderColor: 'var(--ink)', background: 'var(--ink)', color: 'var(--bg)' } : { borderColor: 'var(--line)', color: 'var(--muted)' }}>
                {CAT_META[c].emoji} {c.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          {feedback.length === 0 && <p className="text-muted text-sm py-10 text-center">No feedback in this category yet.</p>}
          <div className="space-y-3">
            {feedback.map(f => {
              const cat = CAT_META[f.category] ?? CAT_META.other
              return (
                <div key={f.id} className="bg-surface rounded-2xl border-2 border-ink shadow-card p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none">{cat.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-ink text-sm">{f.summary || f.raw_text.slice(0, 80)}</p>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed whitespace-pre-wrap">{f.raw_text}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2.5">
                        <span className="text-[11px] font-bold rounded-full px-2 py-0.5" style={{ background: cat.bg, color: cat.color }}>{f.category.replace(/_/g, ' ')}</span>
                        <span className="text-[11px] font-bold rounded-full px-2 py-0.5 border" style={{ color: PRIORITY_COLOR[f.priority] ?? '#6b7280', borderColor: (PRIORITY_COLOR[f.priority] ?? '#6b7280') + '55' }}>{f.priority}</span>
                        <span className="text-[11px] font-semibold rounded-full bg-slate-100 text-slate-500 px-2 py-0.5">📍 {f.affected_area?.replace(/_/g, ' ')}</span>
                        <span className="text-[11px] text-muted ml-auto">{f.name || 'Anonymous'}{f.email ? ` · ${f.email}` : ''} · {fmtDate(f.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Users ── */}
      {tab === 'users' && (
        <div className="space-y-4">
          <input value={userQuery} onChange={e => setUserQuery(e.target.value)} placeholder="Search by name or email…"
            className="w-full max-w-md rounded-xl border-2 border-line px-4 py-2.5 text-sm bg-surface text-ink focus:outline-none focus:border-violet-400" />
          <div className="bg-surface rounded-2xl border-2 border-ink shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-bold">Name</th>
                    <th className="px-4 py-3 font-bold">Email</th>
                    <th className="px-4 py-3 font-bold">Roles</th>
                    <th className="px-4 py-3 font-bold">Verified</th>
                    <th className="px-4 py-3 font-bold">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-line/60 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-semibold text-ink">{u.full_name}</td>
                      <td className="px-4 py-3 text-slate-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="flex gap-1">
                          {u.is_candidate && <span className="text-[10px] font-bold rounded bg-teal-100 text-teal-700 px-1.5 py-0.5">candidate</span>}
                          {u.is_recruiter && <span className="text-[10px] font-bold rounded bg-blue-100 text-blue-700 px-1.5 py-0.5">recruiter</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">{u.email_verified ? '✅' : '—'}</td>
                      <td className="px-4 py-3 text-muted">{fmtDate(u.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {users.length === 0 && <p className="text-muted text-sm py-10 text-center">No users found.</p>}
          </div>
        </div>
      )}

      {/* ── Jobs ── */}
      {tab === 'jobs' && (
        <div className="bg-surface rounded-2xl border-2 border-ink shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-bold">Title</th>
                  <th className="px-4 py-3 font-bold">Company</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Applicants</th>
                  <th className="px-4 py-3 font-bold">Posted</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.id} className="border-b border-line/60 hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-semibold text-ink">{j.title}{j.is_campus_hiring && <span className="ml-2 text-[10px] font-bold rounded bg-violet-100 text-violet-700 px-1.5 py-0.5">campus</span>}</td>
                    <td className="px-4 py-3 text-slate-600">{j.company}</td>
                    <td className="px-4 py-3"><span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${j.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{j.status}</span></td>
                    <td className="px-4 py-3 text-right font-bold text-ink">{j.applicants}</td>
                    <td className="px-4 py-3 text-muted">{fmtDate(j.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {jobs.length === 0 && <p className="text-muted text-sm py-10 text-center">No jobs yet.</p>}
        </div>
      )}
    </div>
  )
}
