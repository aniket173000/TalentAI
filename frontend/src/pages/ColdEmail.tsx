import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../api/client'

/**
 * Cold Email — paste a hiring post, get a personalized application email
 * grounded in your Nideknil profile, review it, and send it from YOUR OWN
 * Gmail with one click. The recruiter sees your address, replies come to you.
 */

interface Quota {
  daily_limit: number
  daily_remaining: number
  monthly_limit: number | null
  monthly_remaining: number | null
  plan: string
}

interface GmailState {
  connected: boolean
  address: string | null
}

interface Draft {
  id: number
  recruiter_email: string | null
  recruiter_name: string | null
  company: string | null
  role_title: string | null
  application_instructions: string | null
  matched_skills: string[]
  subject: string
  body: string
  tone: string
  template: string
  template_label: string
  status: string
  warnings: string[]
  quota: Quota
  gmail: GmailState
}

interface HistoryItem {
  id: number
  recruiter_email: string | null
  company: string | null
  role_title: string | null
  subject: string | null
  status: string
  created_at: string | null
  sent_at: string | null
}

type ApiErr = { response?: { status?: number; data?: { detail?: string } } }

const INP = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition'
const TONES: { key: string; label: string }[] = [
  { key: 'direct', label: 'Direct' },
  { key: 'warm', label: 'Warm' },
  { key: 'formal', label: 'Formal' },
]

export default function ColdEmail() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [gmail, setGmail] = useState<GmailState>({ connected: false, address: null })
  const [quota, setQuota] = useState<Quota | null>(null)
  const [hasResumeFile, setHasResumeFile] = useState(false)
  const [hasProfile, setHasProfile] = useState(true)

  const [source, setSource] = useState('')
  const [tone, setTone] = useState('direct')
  const [analyzing, setAnalyzing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)

  // Editable fields (seeded from the draft — what you see is exactly what sends)
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attachResume, setAttachResume] = useState(true)

  const [sending, setSending] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [sent, setSent] = useState('')
  const [error, setError] = useState('')
  const [banner, setBanner] = useState('')

  const [history, setHistory] = useState<HistoryItem[]>([])

  const loadStatus = () => {
    api.get('/cold-email/status').then(r => {
      setGmail(r.data.gmail)
      setQuota(r.data.quota)
      setHasResumeFile(r.data.has_resume_file)
      setHasProfile(r.data.has_profile)
      setAttachResume(r.data.has_resume_file)
    }).catch(() => {})
  }
  const loadHistory = () => {
    api.get<{ items: HistoryItem[] }>('/cold-email/history')
      .then(r => setHistory(r.data.items))
      .catch(() => {})
  }

  useEffect(() => {
    loadStatus()
    loadHistory()
    // Returning from the Google consent screen
    const result = searchParams.get('gmail')
    if (result) {
      if (result === 'connected') setBanner('Gmail connected — you can now send with one click. ✓')
      else if (result === 'scope_denied') setError('Gmail was connected without the "send email" permission — reconnect and keep that box ticked.')
      else setError('Could not connect Gmail. Please try again.')
      searchParams.delete('gmail')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const detailOf = (e: unknown) => (e as ApiErr)?.response?.data?.detail

  const analyze = async () => {
    setAnalyzing(true); setError(''); setSent(''); setDraft(null)
    try {
      const r = await api.post<Draft>('/cold-email/analyze', { source_text: source, tone })
      seedDraft(r.data)
    } catch (e: unknown) {
      setError(detailOf(e) || 'Could not analyze the post. Try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  const regenerate = async (nextTone: string) => {
    if (!draft) return
    setTone(nextTone)
    setAnalyzing(true); setError('')
    try {
      const r = await api.post<Draft>('/cold-email/redraft', { id: draft.id, tone: nextTone })
      seedDraft(r.data)
    } catch (e: unknown) {
      setError(detailOf(e) || 'Redraft failed. Try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  const seedDraft = (d: Draft) => {
    setDraft(d)
    setEmail(d.recruiter_email ?? '')
    setSubject(d.subject)
    setBody(d.body)
    setQuota(d.quota)
    setGmail(d.gmail)
  }

  const connectGmail = async () => {
    setConnecting(true); setError('')
    try {
      const r = await api.get<{ url: string }>('/cold-email/gmail/connect-url')
      window.location.href = r.data.url
    } catch (e: unknown) {
      setError(detailOf(e) || 'Could not start the Gmail connection.')
      setConnecting(false)
    }
  }

  const disconnectGmail = async () => {
    if (!confirm(`Disconnect ${gmail.address}? You won't be able to send until you reconnect.`)) return
    try {
      await api.delete('/cold-email/gmail')
      loadStatus()
    } catch { /* ignore */ }
  }

  const send = async () => {
    if (!draft) return
    if (!email.includes('@')) { setError('Enter the recruiter\'s email before sending.'); return }
    if (!confirm(`Send this email to ${email} from ${gmail.address}?`)) return
    setSending(true); setError(''); setSent('')
    try {
      const r = await api.post('/cold-email/send', {
        id: draft.id,
        recruiter_email: email.trim(),
        subject, body,
        attach_resume: attachResume && hasResumeFile,
      })
      setSent(`Sent to ${email} from ${gmail.address}${r.data.attached_resume ? ' — resume attached' : ''} ✓`)
      setQuota(r.data.quota)
      setDraft(null); setSource(''); setSubject(''); setBody(''); setEmail('')
      loadHistory()
    } catch (e: unknown) {
      const detail = detailOf(e)
      if (detail === 'gmail_not_connected') {
        setGmail({ connected: false, address: null })
        setError('Your Gmail connection expired — reconnect below, then hit Send again.')
      } else {
        setError(detail || 'Send failed.')
      }
    } finally {
      setSending(false)
    }
  }

  const quotaLine = quota && (
    <span className="text-xs text-slate-500">
      {quota.monthly_remaining !== null
        ? `${quota.monthly_remaining} of ${quota.monthly_limit} free sends left this month`
        : `${quota.plan} plan`}
      {' · '}{quota.daily_remaining} of {quota.daily_limit} today
    </span>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Cold Email</h1>
        <p className="text-sm text-slate-500 mt-1">
          Two steps: paste a hiring post, then review and send. We extract the recruiter's
          email and draft a personalized application from <span className="font-semibold">your verified profile</span>,
          written with the best-fit pick from <span className="font-semibold">5 proven cold-email frameworks</span> —
          then send it from <span className="font-semibold">your own Gmail</span>. The recruiter sees your address,
          and replies come straight to you.
        </p>
      </div>

      {/* Gmail connection + quota bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          {gmail.connected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-slate-700">Sending as <span className="font-semibold">{gmail.address}</span></span>
              <button onClick={disconnectGmail} className="text-xs text-slate-400 hover:text-red-500 underline ml-1">disconnect</button>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
              <span className="text-slate-500">Gmail not connected</span>
              <button onClick={connectGmail} disabled={connecting}
                className="ml-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg px-3 py-1.5 transition disabled:opacity-50">
                {connecting ? 'Opening Google…' : 'Connect Gmail'}
              </button>
            </>
          )}
        </div>
        {quotaLine}
      </div>

      {banner && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{banner}</div>}
      {sent && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{sent}</div>}
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      {!hasProfile && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Upload a resume first — your profile is what makes the email personal.{' '}
          <Link to="/profile" className="font-semibold underline">Go to profile</Link>
        </div>
      )}

      {/* Step 1 — paste + analyze */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Step 1 · Paste the hiring post</label>
        <textarea
          value={source}
          onChange={e => setSource(e.target.value)}
          rows={7}
          placeholder="Paste the full post here (LinkedIn, email, anywhere) — include the recruiter's email if it's in the post."
          className={INP + ' resize-y'}
        />
        <div className="flex items-center gap-2">
          <button onClick={analyze} disabled={analyzing || !hasProfile || source.trim().length < 30}
            className="bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition disabled:opacity-50">
            {analyzing && !draft ? 'Analyzing…' : 'Analyze'}
          </button>
          <span className="text-xs text-slate-400">Drafting is free — you only use a send when you hit Send.</span>
        </div>
      </div>

      {/* Step 2 — review + send */}
      {draft && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Step 2 · Review &amp; send</label>
            <span className="text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2.5 py-0.5 shrink-0">
              📋 {draft.template_label} framework
            </span>
          </div>
          {draft.warnings.map((w, i) => (
            <div key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">⚠️ {w}</div>
          ))}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Recruiter email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email"
                placeholder="name@company.com" className={INP} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Role · company</label>
              <div className="text-sm text-slate-700 py-2">
                {draft.role_title || '—'}{draft.company ? ` · ${draft.company}` : ''}
              </div>
            </div>
          </div>

          {draft.matched_skills.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Your matching skills (what the draft is built on)</label>
              <div className="flex flex-wrap gap-1.5">
                {draft.matched_skills.map(s => (
                  <span key={s} className="text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2.5 py-0.5">{s}</span>
                ))}
              </div>
            </div>
          )}

          {draft.application_instructions && (
            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              📌 The post asks: <span className="font-medium">{draft.application_instructions}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className={INP} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Body — sent exactly as shown</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={14}
              className={INP + ' resize-y'} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Tone:</span>
            {TONES.map(t => (
              <button key={t.key} onClick={() => regenerate(t.key)} disabled={analyzing}
                className={`text-xs font-semibold rounded-full px-3 py-1 border transition disabled:opacity-50 ${
                  tone === t.key
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}>
                {t.label}
              </button>
            ))}
            {analyzing && draft && <span className="text-xs text-slate-400">Redrafting…</span>}
          </div>

          <label className={`flex items-center gap-2 text-sm ${hasResumeFile ? 'text-slate-700' : 'text-slate-400'}`}>
            <input type="checkbox" checked={attachResume && hasResumeFile} disabled={!hasResumeFile}
              onChange={e => setAttachResume(e.target.checked)} className="rounded border-slate-300" />
            Attach my resume
            {!hasResumeFile && <span className="text-xs">(no resume file on your profile)</span>}
          </label>

          <div className="flex gap-2 pt-1">
            {gmail.connected ? (
              <button onClick={send} disabled={sending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition disabled:opacity-50">
                {sending ? 'Sending…' : `Send from ${gmail.address}`}
              </button>
            ) : (
              <button onClick={connectGmail} disabled={connecting}
                className="bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg px-4 py-2 text-sm transition disabled:opacity-50">
                {connecting ? 'Opening Google…' : 'Connect Gmail to send'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-slate-800 mb-3">Your cold emails</h3>
          <div className="space-y-1.5">
            {history.map(h => (
              <div key={h.id} className="flex items-center justify-between gap-3 text-sm border-b border-slate-100 last:border-0 py-1.5">
                <div className="min-w-0">
                  <span className="font-medium text-slate-800">{h.recruiter_email || '—'}</span>
                  <span className="text-slate-400">
                    {h.role_title ? ` · ${h.role_title}` : ''}{h.company ? ` @ ${h.company}` : ''}
                  </span>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                  h.status === 'sent' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : h.status === 'failed' ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>{h.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
