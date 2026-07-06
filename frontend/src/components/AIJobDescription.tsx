import { useRef, useState } from 'react'
import api, { streamPost } from '../api/client'

export interface SuggestedDetails {
  department: string
  employment_type: string
  remote_policy: string
  location: string
}

interface Props {
  value: string
  onChange: (v: string) => void
  /** Context the generator needs. */
  title: string
  company?: string
  employmentType?: string
  location?: string
  /** Called with inferred Department/Employment Type/Remote Policy/Location after a generation. */
  onDetails?: (d: SuggestedDetails) => void
  /** Show the "Upload file" mode (jobs support it; referrals don't). */
  allowUpload?: boolean
  onFile?: (f: File | null) => void
  fileName?: string
  minChars?: number
  rows?: number
}

type Mode = 'ai' | 'paste' | 'upload'

/**
 * Job-description input with three modes — Write with AI (streams the JD into
 * the editable box in real time), Paste, and Upload. The textarea is always the
 * source of truth and stays fully editable, including after AI generation.
 */
export default function AIJobDescription({
  value, onChange, title, company, employmentType, location,
  onDetails, allowUpload = false, onFile, fileName, minChars = 100, rows = 12,
}: Props) {
  const [mode, setMode] = useState<Mode>('ai')
  const [context, setContext] = useState('')
  const [generating, setGenerating] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const generate = async () => {
    if (!title.trim()) { setErr('Add a job title first, then generate.'); return }
    setErr('')
    setGenerating(true)
    onChange('') // start fresh; the box fills as tokens stream in
    const ctrl = new AbortController()
    abortRef.current = ctrl
    let acc = ''
    try {
      await streamPost('/ai/job-description',
        { title, company, employment_type: employmentType, location, context: context.trim() || undefined },
        chunk => { acc += chunk; onChange(acc) },
        ctrl.signal,
      )
      // Once the JD exists, offer to fill the structured fields (still editable).
      if (onDetails && acc.trim().length > 40) {
        try {
          const { data } = await api.post<SuggestedDetails>('/ai/job-details',
            { title, company, jd_text: acc })
          onDetails(data)
        } catch { /* non-fatal */ }
      }
    } catch (e: unknown) {
      if ((e as Error)?.name !== 'AbortError') {
        setErr((e as Error)?.message || 'Generation failed. You can write it manually.')
      }
    } finally {
      setGenerating(false)
      abortRef.current = null
    }
  }

  const stop = () => abortRef.current?.abort()

  const chip = (m: Mode, label: string) => (
    <button type="button" onClick={() => setMode(m)}
      className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition ${
        mode === m
          ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
          : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
      {label}
    </button>
  )

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {chip('ai', '✨ Write with AI')}
        {chip('paste', 'Paste')}
        {allowUpload && chip('upload', 'Upload')}
      </div>

      {mode === 'ai' && (
        <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
          <label className="block text-xs font-bold text-violet-800 mb-1.5">
            Anything specific? <span className="font-normal text-violet-500">(optional — stack, seniority, must-haves)</span>
          </label>
          <input
            type="text" value={context} onChange={e => setContext(e.target.value)}
            placeholder="e.g. Go + Postgres, 5+ yrs, owns payments reliability"
            className="w-full border border-violet-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-violet-400 transition"
          />
          <div className="mt-3 flex items-center gap-3">
            {!generating ? (
              <button type="button" onClick={generate}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-pink-600 text-white text-sm font-bold hover:from-violet-500 hover:to-pink-500 transition disabled:opacity-50">
                {value.trim() ? 'Regenerate' : 'Generate with AI'}
              </button>
            ) : (
              <button type="button" onClick={stop}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-bold hover:bg-slate-50 transition inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                Stop
              </button>
            )}
            <span className="text-xs text-slate-500">The draft appears below — edit it freely.</span>
          </div>
        </div>
      )}

      {mode === 'upload' && allowUpload && (
        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-bold hover:bg-white transition">
            {fileName ? `✓ ${fileName}` : 'Choose PDF / DOCX / TXT'}
          </button>
          <span className="text-xs text-slate-500">We'll extract the description from your file on submit.</span>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden"
            onChange={e => onFile?.(e.target.files?.[0] || null)} />
        </div>
      )}

      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={mode === 'upload'
          ? 'Or type / paste the description here…'
          : 'Your job description will appear here — or write it yourself…'}
        rows={rows}
        className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition resize-y"
      />

      <div className="mt-1 flex items-center justify-between">
        {value.length > 0 && value.length < minChars ? (
          <p className="text-xs text-red-500">{value.length} / {minChars} characters minimum</p>
        ) : <span />}
        {generating && <span className="text-xs text-violet-600 font-medium">Writing…</span>}
      </div>
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  )
}
