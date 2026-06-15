import { useEffect, useRef, useState } from 'react'
import api from '../api/client'
import { PracticeApplyResult } from '../types'

interface Props {
  jobId: number
  jobTitle: string
  company: string
  isFresherFriendly: boolean
  onClose: () => void
}

export default function PracticeApplyModal({
  jobId,
  jobTitle,
  company,
  isFresherFriendly,
  onClose,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PracticeApplyResult | null>(null)
  const [error, setError] = useState('')
  const [scoreAnimated, setScoreAnimated] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Animate score ring after result arrives
  useEffect(() => {
    if (result) {
      const t = setTimeout(() => setScoreAnimated(true), 120)
      return () => clearTimeout(t)
    }
  }, [result])

  const handleTest = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('resume_file', file)
      const res = await api.post<PracticeApplyResult>(`/jobs/${jobId}/practice-apply`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(res.data)
    } catch {
      setError('Failed to analyse resume. Please try a different file.')
    } finally {
      setLoading(false)
    }
  }

  const roadmap = result?.roadmap_data
  // Use the AI's honest readiness_score, not the screening match_score
  const score = roadmap?.readiness_score ?? result?.match_score ?? 0

  // SVG ring maths
  const R = 52
  const C = 2 * Math.PI * R
  const dashOffset = scoreAnimated ? C * (1 - score / 100) : C

  const ringColor =
    score >= 75 ? '#10b981' :
    score >= 50 ? '#f59e0b' :
    score >= 25 ? '#f97316' :
    '#ef4444'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">

        {/* ── Gradient header ── */}
        <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-pink-600 rounded-t-3xl p-6 text-white relative overflow-hidden">
          {/* Background glimmer */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
          <div className="relative">
            <div className="flex items-start justify-between mb-1">
              <div>
                <span className="inline-flex items-center gap-1.5 bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full mb-3 backdrop-blur-sm">
                  <span className="animate-pulse">●</span> Practice Mode
                </span>
                <h2 className="text-xl font-extrabold leading-tight">{jobTitle}</h2>
                <p className="text-violet-200 text-sm mt-0.5">{company}</p>
              </div>
              <button
                onClick={onClose}
                className="text-violet-300 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-violet-100 bg-white/10 rounded-xl px-4 py-2.5 mt-3">
              Test your resume against this job — no account needed, no application submitted, full AI feedback.
            </p>
          </div>
        </div>

        <div className="p-6">
          {!result ? (
            /* ── Upload phase ── */
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault()
                  setDragOver(false)
                  const f = e.dataTransfer.files[0]
                  if (f) setFile(f)
                }}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all select-none ${
                  dragOver
                    ? 'border-violet-400 bg-violet-50 scale-[1.01]'
                    : file
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/50'
                }`}
              >
                {file ? (
                  <div>
                    <p className="text-4xl mb-2">✅</p>
                    <p className="font-semibold text-slate-800 text-sm">{file.name}</p>
                    <p className="text-xs text-slate-400 mt-1">Click to change</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-4xl mb-3">📄</p>
                    <p className="font-semibold text-slate-700">Drop your resume here</p>
                    <p className="text-slate-400 text-xs mt-1">PDF, DOCX, or TXT</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) setFile(f)
                }}
              />

              {isFresherFriendly && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                  <span className="text-emerald-500 text-lg shrink-0">⚡</span>
                  <div>
                    <p className="text-xs font-bold text-emerald-700">Project-First Scoring Active</p>
                    <p className="text-xs text-emerald-600">Your projects count for 40% — experience weight reduced for this role.</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 text-xs text-slate-400 bg-slate-50 rounded-xl px-4 py-3">
                <span className="text-slate-300 text-base">🔒</span>
                <span>Your resume is only used for this analysis. It's not stored or added to any application.</span>
              </div>

              {error && <p className="text-red-500 text-sm text-center">{error}</p>}

              <button
                onClick={handleTest}
                disabled={!file || loading}
                className={`w-full py-4 rounded-2xl font-bold text-sm transition-all ${
                  file && !loading
                    ? 'bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white shadow-lg shadow-violet-200 hover:shadow-violet-300 hover:scale-[1.01]'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    AI is analysing your resume…
                  </span>
                ) : '✨ Test My Chances'}
              </button>
            </div>
          ) : (
            /* ── Results phase ── */
            <div className="space-y-5 animate-fade-in">
              {/* Score hero */}
              <div className="flex flex-col items-center py-2">
                <div className="relative">
                  <svg width="140" height="140" className="-rotate-90">
                    <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f5f9" strokeWidth="12" />
                    <circle
                      cx="70" cy="70" r={R}
                      fill="none"
                      stroke={ringColor}
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={C}
                      strokeDashoffset={dashOffset}
                      style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.34,1.56,0.64,1)' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-extrabold text-slate-800">{score.toFixed(0)}%</span>
                    <span className="text-[11px] text-slate-400 font-medium mt-0.5">Readiness</span>
                  </div>
                </div>

                <div className={`mt-3 px-4 py-1.5 rounded-full text-sm font-bold ${
                  score >= 75 ? 'bg-emerald-100 text-emerald-700'
                  : score >= 50 ? 'bg-amber-100 text-amber-700'
                  : score >= 25 ? 'bg-orange-100 text-orange-700'
                  : 'bg-red-100 text-red-700'
                }`}>
                  {roadmap?.readiness_label ?? 'Assessed'}
                </div>

                {/* Domain gap warning — shown when AI detects a career switch is needed */}
                {roadmap?.domain_gap && (
                  <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-left max-w-sm">
                    <span className="text-red-500 text-base shrink-0 mt-0.5">⚠️</span>
                    <p className="text-xs text-red-700 font-medium">{roadmap.domain_gap}</p>
                  </div>
                )}

                {result.scoring_mode === 'fresher' && (
                  <span className="mt-2 text-xs bg-violet-100 text-violet-700 font-semibold px-3 py-1 rounded-full">
                    ⚡ Project-First scoring
                  </span>
                )}
              </div>

              {/* Encouragement */}
              {roadmap?.encouragement && (
                <div className="bg-gradient-to-r from-violet-600 to-pink-600 rounded-2xl p-4 text-white text-sm font-medium text-center leading-relaxed">
                  {roadmap.encouragement}
                </div>
              )}

              {/* Quick wins */}
              {(roadmap?.quick_wins?.length ?? 0) > 0 && (
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-100 p-4">
                  <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-3">⚡ Quick Wins — do these today</p>
                  <ul className="space-y-2">
                    {roadmap!.quick_wins.map((win, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="text-emerald-500 font-bold shrink-0 mt-0.5">→</span>
                        {win}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Roadmap */}
              {(roadmap?.roadmap?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Your Roadmap to 85%+</p>
                  <div className="space-y-3">
                    {roadmap!.roadmap.map((item, i) => (
                      <div key={i} className="bg-slate-50 rounded-2xl border border-slate-100 p-4 hover:border-violet-200 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-bold text-slate-800 text-sm">{item.skill_area}</p>
                          <span className="text-xs bg-violet-100 text-violet-700 font-bold px-2.5 py-0.5 rounded-full shrink-0">
                            +{item.estimated_gain} pts
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mb-2">Now: {item.current}</p>
                        <p className="text-xs text-slate-700 font-medium">→ {item.action}</p>
                        {item.resource_hint && (
                          <p className="text-xs text-violet-600 mt-2 bg-violet-50 rounded-xl px-3 py-1.5">
                            💡 {item.resource_hint}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gaps & Strengths */}
              <div className="grid gap-3 sm:grid-cols-2">
                {result.strengths?.length > 0 && (
                  <div className="bg-white rounded-2xl border border-emerald-100 p-4">
                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-2">✓ Strengths</p>
                    <ul className="space-y-1.5">
                      {result.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.gaps?.length > 0 && (
                  <div className="bg-white rounded-2xl border border-amber-100 p-4">
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">! Gaps</p>
                    <ul className="space-y-1.5">
                      {result.gaps.map((g, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setResult(null); setFile(null); setScoreAnimated(false) }}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors"
                >
                  ← Try another resume
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
