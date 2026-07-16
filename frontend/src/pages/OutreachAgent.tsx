import { useEffect, useState } from 'react'
import api from '../api/client'

interface Draft {
  hiring_email: string | null
  contact_name: string | null
  company: string | null
  roles: string[]
  context: string
  subject: string
  body: string
  already_contacted_at: string | null
}

interface HistoryItem {
  id: number
  target_email: string
  company: string | null
  roles: string[]
  subject: string
  status: string
  created_at: string | null
  sent_at: string | null
}

const INP = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition'

export default function OutreachAgent() {
  const [source, setSource] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')

  // Editable fields (seeded from the draft, admin can correct before sending)
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState('')

  const [history, setHistory] = useState<HistoryItem[]>([])

  const loadHistory = () => {
    api.get<{ items: HistoryItem[] }>('/outreach/history')
      .then(r => setHistory(r.data.items))
      .catch(() => {})
  }
  useEffect(loadHistory, [])

  const analyze = async () => {
    setAnalyzing(true); setError(''); setSent(''); setDraft(null)
    try {
      const r = await api.post<Draft>('/outreach/draft', { source_text: source })
      setDraft(r.data)
      setEmail(r.data.hiring_email ?? '')
      setSubject(r.data.subject)
      setBody(r.data.body)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || 'Could not analyze the post. Try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  const send = async () => {
    if (!email.includes('@')) { setError('Enter a valid recipient email before sending.'); return }
    if (!confirm(`Send this email to ${email} from talent@nideknil.in?`)) return
    setSending(true); setError(''); setSent('')
    try {
      await api.post('/outreach/send', {
        target_email: email.trim(),
        subject, body,
        company: draft?.company ?? null,
        contact_name: draft?.contact_name ?? null,
        roles: draft?.roles ?? [],
        source_text: source,
      })
      setSent(`Sent to ${email} ✓`)
      setDraft(null); setSource(''); setSubject(''); setBody(''); setEmail('')
      loadHistory()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || 'Send failed.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Outreach agent</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Paste a hiring post (LinkedIn etc.). The agent extracts the contact + roles and drafts a
          Nideknil pitch. Review, then send from <span className="font-semibold">talent@nideknil.in</span>.
        </p>
      </div>

      {/* Step 1 — paste + analyze */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Hiring post</label>
        <textarea
          value={source}
          onChange={e => setSource(e.target.value)}
          rows={7}
          placeholder="Paste the full post text here — include the apply-to email if it's in the post."
          className={INP + ' resize-y'}
        />
        <button onClick={analyze} disabled={analyzing || source.trim().length < 30}
          className="bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition disabled:opacity-50">
          {analyzing ? 'Analyzing…' : 'Analyze & draft'}
        </button>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
      {sent && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{sent}</div>}

      {/* Step 2 — review + send */}
      {draft && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          {draft.already_contacted_at && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ This email was already contacted on {new Date(draft.already_contacted_at).toLocaleDateString()}.
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Recipient email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email"
                placeholder="name@company.com" className={INP} />
              {!draft.hiring_email && (
                <p className="text-[11px] text-amber-600 mt-1">No email found in the post — add it manually.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Company · roles</label>
              <div className="text-sm text-slate-700 py-2">
                {draft.company || '—'}{draft.roles.length ? ` · ${draft.roles.join(', ')}` : ''}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className={INP} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Body</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={14}
              className={INP + ' resize-y font-[inherit]'} />
          </div>

          <div className="flex gap-2">
            <button onClick={send} disabled={sending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg px-4 py-2 text-sm transition disabled:opacity-50">
              {sending ? 'Sending…' : 'Approve & send'}
            </button>
            <button onClick={analyze} disabled={analyzing}
              className="border border-slate-300 text-slate-600 font-semibold rounded-lg px-4 py-2 text-sm hover:bg-slate-50 transition disabled:opacity-50">
              Re-draft
            </button>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-slate-800 mb-3">Recent outreach</h3>
          <div className="space-y-1.5">
            {history.map(h => (
              <div key={h.id} className="flex items-center justify-between gap-3 text-sm border-b border-slate-100 last:border-0 py-1.5">
                <div className="min-w-0">
                  <span className="font-medium text-slate-800">{h.target_email}</span>
                  {h.company && <span className="text-slate-400"> · {h.company}</span>}
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
