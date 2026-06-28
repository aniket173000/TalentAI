import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

type Mood = 'love' | 'happy' | 'neutral' | 'frustrated' | 'bug'
type Stage = 'form' | 'loading' | 'done'

interface AnalysisResult {
  category: string
  summary: string
  priority: string
  sentiment: string
  affected_area: string
}

const MOODS: { key: Mood; emoji: string; label: string; color: string }[] = [
  { key: 'love',       emoji: '😍', label: 'Loving it',     color: '#f472b6' },
  { key: 'happy',      emoji: '😊', label: 'It\'s good',    color: '#34d399' },
  { key: 'neutral',    emoji: '😐', label: 'It\'s okay',    color: '#94a3b8' },
  { key: 'frustrated', emoji: '😤', label: 'Frustrated',    color: '#fb923c' },
  { key: 'bug',        emoji: '🐛', label: 'Found a bug',   color: '#f87171' },
]

const CATEGORY_META: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  bug:             { emoji: '🐛', label: 'Bug Report',        color: '#dc2626', bg: '#fef2f2' },
  feature_request: { emoji: '💡', label: 'Feature Request',   color: '#7c3aed', bg: '#f5f3ff' },
  ui_ux:           { emoji: '🎨', label: 'Design & UX',       color: '#0284c7', bg: '#f0f9ff' },
  performance:     { emoji: '⚡', label: 'Performance',       color: '#d97706', bg: '#fffbeb' },
  praise:          { emoji: '❤️',  label: 'Praise',           color: '#db2777', bg: '#fdf2f8' },
  question:        { emoji: '❓', label: 'Question',          color: '#6b7280', bg: '#f9fafb' },
  security:        { emoji: '🔒', label: 'Security',          color: '#1d4ed8', bg: '#eff6ff' },
  other:           { emoji: '💬', label: 'General Feedback',  color: '#374151', bg: '#f9fafb' },
}

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  high:   { label: 'High Priority',   color: '#dc2626', bg: '#fef2f2' },
  medium: { label: 'Medium Priority', color: '#d97706', bg: '#fffbeb' },
  low:    { label: 'Low Priority',    color: '#6b7280', bg: '#f9fafb' },
}

const AREA_LABELS: Record<string, string> = {
  onboarding:  'Onboarding',
  job_search:  'Job Search',
  application: 'Application Flow',
  profile:     'Profile',
  colleges:    'Colleges',
  referrals:   'Referrals',
  recruiter:   'Recruiter Portal',
  general:     'General',
}

const ENCOURAGING_MESSAGES: Record<string, string> = {
  bug:             "You just saved another user from hitting this. Thank you for reporting it — we\'re on it.",
  feature_request: "Love this idea. We capture every request and the ones that come up most shape our roadmap.",
  ui_ux:           "Great eye. Little UX improvements compound — this will make the experience better for everyone.",
  performance:     "Speed matters and we take it seriously. This goes straight to the top of our list.",
  praise:          "This genuinely means a lot to the team. We\'re building this for people like you.",
  question:        "Good question — and if you\'re asking, others probably are too. We\'ll make this clearer.",
  security:        "Thank you for flagging this responsibly. Our team will review it immediately.",
  other:           "Every bit of feedback helps us understand what matters. Thank you for taking the time.",
}

export default function Feedback() {
  const { user } = useAuth()

  const [stage, setStage] = useState<Stage>('form')
  const [mood, setMood] = useState<Mood | null>(null)
  const [text, setText] = useState('')
  const [name, setName] = useState(user?.full_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [error, setError] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)

  const charLimit = 2000
  const canSubmit = text.trim().length >= 10 && text.length <= charLimit

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setStage('loading')
    try {
      const res = await api.post('/product-feedback', {
        text: text.trim(),
        mood: mood ?? undefined,
        name: name.trim() || undefined,
        email: email.trim() || undefined,
      })
      setResult(res.data)
      setStage('done')
    } catch {
      setError('Something went wrong — please try again.')
      setStage('form')
    }
  }

  const cat = result ? (CATEGORY_META[result.category] ?? CATEGORY_META.other) : null
  const pri = result ? (PRIORITY_META[result.priority] ?? PRIORITY_META.low) : null
  const encouraging = result ? (ENCOURAGING_MESSAGES[result.category] ?? ENCOURAGING_MESSAGES.other) : ''

  // ── Loading ───────────────────────────────────────────────────────────────
  if (stage === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-20">
        <div className="text-center space-y-5 max-w-sm">
          <div className="text-5xl animate-pulse">🧠</div>
          <h2 className="text-xl font-extrabold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
            Reading your feedback…
          </h2>
          <p className="text-sm text-muted leading-relaxed">
            Our AI is understanding what you said, categorising it, and making sure the right people see it.
          </p>
          <div className="flex justify-center gap-1.5 pt-2">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-violet-400"
                style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (stage === 'done' && result && cat && pri) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg space-y-6 animate-fade-in">

          {/* Hero thank-you */}
          <div className="text-center space-y-3">
            <div className="text-6xl">🙌</div>
            <h1 className="text-2xl font-extrabold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
              You just made Nideknil better.
            </h1>
            <p className="text-sm text-muted leading-relaxed max-w-sm mx-auto">
              {encouraging}
            </p>
          </div>

          {/* AI understanding card */}
          <div
            className="rounded-2xl border-2 border-ink shadow-card p-6 space-y-5"
            style={{ background: cat.bg }}
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl leading-none">{cat.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted mb-1">
                  Here's what we understood
                </p>
                <p className="font-extrabold text-ink leading-snug" style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>
                  {result.summary}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span
                className="text-xs font-bold rounded-full px-3 py-1"
                style={{ background: cat.bg, color: cat.color, border: `1.5px solid ${cat.color}40` }}
              >
                {cat.emoji} {cat.label}
              </span>
              <span
                className="text-xs font-bold rounded-full px-3 py-1"
                style={{ background: pri.bg, color: pri.color, border: `1.5px solid ${pri.color}40` }}
              >
                {pri.label}
              </span>
              <span className="text-xs font-bold rounded-full px-3 py-1 bg-slate-100 text-slate-600 border border-slate-200">
                📍 {AREA_LABELS[result.affected_area] ?? result.affected_area}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => { setStage('form'); setResult(null); setText(''); setMood(null) }}
              className="flex-1 border-2 border-ink rounded-xl py-3 text-sm font-bold text-ink hover:bg-surface transition-colors"
            >
              Send more feedback
            </button>
            <Link
              to="/"
              className="flex-1 text-center rounded-xl py-3 text-sm font-bold text-white transition-colors"
              style={{ background: 'var(--violet)', border: '2px solid var(--ink)', boxShadow: '3px 3px 0 var(--ink)' }}
            >
              Back to jobs →
            </Link>
          </div>

        </div>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-start px-4 py-14">
      <div className="w-full max-w-xl space-y-8">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="text-5xl">💬</div>
          <h1
            className="text-3xl sm:text-4xl font-extrabold text-ink leading-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Your voice shapes Nideknil.
          </h1>
          <p className="text-muted leading-relaxed max-w-sm mx-auto text-sm">
            Found a bug? Dreaming of a feature? Just want to say something?
            Every word you write helps us build a platform you actually love.
          </p>
        </div>

        {/* Form card */}
        <form onSubmit={handleSubmit} className="bg-surface rounded-2xl border-2 border-ink shadow-card p-6 sm:p-8 space-y-7">

          {/* Mood */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">How are you feeling? (optional)</p>
            <div className="flex gap-2 flex-wrap">
              {MOODS.map(m => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMood(prev => prev === m.key ? null : m.key)}
                  title={m.label}
                  className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border-2 transition-all text-xs font-semibold"
                  style={{
                    borderColor: mood === m.key ? m.color : 'var(--line)',
                    background: mood === m.key ? `${m.color}15` : 'var(--bg)',
                    color: mood === m.key ? m.color : 'var(--muted)',
                    transform: mood === m.key ? 'scale(1.08)' : 'scale(1)',
                  }}
                >
                  <span style={{ fontSize: 22 }}>{m.emoji}</span>
                  <span style={{ fontSize: 10 }}>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Text */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted block">
              Tell us anything <span className="text-red-400">*</span>
            </label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={6}
              placeholder="What's working, what's broken, what you wish existed… no filter needed. We read every single one."
              className="w-full rounded-xl border-2 border-line px-4 py-3 text-sm resize-none focus:outline-none focus:border-violet-400 transition-colors bg-bg text-ink"
              style={{ lineHeight: 1.7 }}
            />
            <div className="flex justify-between items-center">
              {text.trim().length > 0 && text.trim().length < 10 && (
                <p className="text-xs text-amber-500">A few more words help us understand better.</p>
              )}
              {text.trim().length === 0 && <span />}
              {text.trim().length >= 10 && <span />}
              <span className={`text-xs ml-auto ${text.length > charLimit ? 'text-red-500 font-bold' : 'text-muted'}`}>
                {text.length} / {charLimit}
              </span>
            </div>
          </div>

          {/* Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-muted block">Your name (optional)</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Radhika Sharma"
                className="w-full rounded-xl border-2 border-line px-4 py-2.5 text-sm focus:outline-none focus:border-violet-400 transition-colors bg-bg text-ink"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-muted block">Email (optional)</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border-2 border-line px-4 py-2.5 text-sm focus:outline-none focus:border-violet-400 transition-colors bg-bg text-ink"
              />
              <p className="text-[10px] text-muted">Only if you want us to follow up.</p>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-xl text-sm font-extrabold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed active:translate-y-0.5"
            style={{
              background: 'var(--violet)',
              border: '2px solid var(--ink)',
              boxShadow: canSubmit ? '4px 4px 0 var(--ink)' : 'none',
              fontFamily: 'var(--font-display)',
              letterSpacing: '-0.01em',
            }}
          >
            Send feedback →
          </button>

          <p className="text-center text-[11px] text-muted leading-relaxed">
            Your feedback is read by real people on the Nideknil team.
            Anonymous submissions are welcome — no account required.
          </p>

        </form>

      </div>
    </div>
  )
}
