import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'

interface CorpusCandidate {
  id: number
  full_name: string | null
  headline: string | null
  location: string | null
  total_yoe: number | null
  skill_count: number
  top_skills: string[]
  source: string
  ingest_status: string
  has_embedding: boolean
  created_at: string
}

interface ListResponse {
  total: number
  limit: number
  offset: number
  candidates: CorpusCandidate[]
}

const STATUS_BADGE: Record<string, string> = {
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  parsing: 'bg-amber-50 text-amber-700 border-amber-200',
  failed: 'bg-red-50 text-red-600 border-red-200',
}

export default function CandidatesCorpus() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [candidates, setCandidates] = useState<CorpusCandidate[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const fetchCorpus = useCallback(() => {
    setLoading(true)
    api.get<ListResponse>('/candidates', { params: { limit: 100 } })
      .then(r => { setCandidates(r.data.candidates); setTotal(r.data.total) })
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchCorpus() }, [fetchCorpus])

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setError('')
    let failed = 0
    // Upload sequentially so each resume is parsed + embedded reliably.
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData()
        fd.append('resume_file', file)
        await api.post('/candidates/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } catch {
        failed += 1
      }
    }
    if (failed) setError(`${failed} file(s) failed to ingest (only PDF/DOCX supported).`)
    if (fileRef.current) fileRef.current.value = ''
    setUploading(false)
    fetchCorpus()
  }

  const removeCandidate = async (id: number) => {
    try {
      await api.delete(`/candidates/${id}`)
      setCandidates(prev => prev.filter(c => c.id !== id))
      setTotal(t => t - 1)
    } catch { /* ignore */ }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Candidate Corpus</h1>
          <p className="text-slate-500 text-sm mt-1">
            {total} candidate{total === 1 ? '' : 's'} — searchable across all your jobs.
          </p>
        </div>
        <button
          onClick={() => navigate('/recruiter/rank-candidates')}
          className="bg-brand-blue hover:bg-blue-600 text-white font-semibold px-5 py-2.5 rounded-xl"
        >
          Rank candidates →
        </button>
      </div>

      {/* Upload card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <h2 className="font-semibold text-slate-700">Upload resumes</h2>
            <p className="text-slate-500 text-sm mt-0.5">
              PDF or DOCX. Each is parsed, structured, and embedded for vector search.
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.docx"
            disabled={uploading}
            onChange={e => handleUpload(e.target.files)}
            className="block text-sm text-slate-600 file:mr-4 file:py-2.5 file:px-5
                       file:rounded-xl file:border-0 file:font-semibold
                       file:bg-brand-blue file:text-white hover:file:bg-blue-600
                       disabled:opacity-40"
          />
        </div>
        {uploading && (
          <div className="mt-4 text-sm text-brand-blue font-medium">Ingesting resumes…</div>
        )}
        {error && (
          <div className="mt-4 text-sm bg-red-50 text-red-600 border border-red-200 rounded-xl px-4 py-2.5">
            {error}
          </div>
        )}
      </div>

      {/* Corpus table */}
      {loading ? (
        <LoadingSpinner />
      ) : candidates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
          No candidates yet. Upload resumes to build your corpus.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Candidate</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Skills</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Exp</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Status</th>
                <th className="px-5 py-3.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {candidates.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <button
                      onClick={() => navigate(`/recruiter/candidates/${c.id}`)}
                      className="font-semibold text-slate-800 hover:text-brand-blue"
                    >
                      {c.full_name || 'Unnamed candidate'}
                    </button>
                    <div className="text-slate-500 text-xs mt-0.5">
                      {c.headline || '—'}{c.location ? ` · ${c.location}` : ''}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {c.top_skills.slice(0, 5).map(s => (
                        <span key={s} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          {s}
                        </span>
                      ))}
                      {c.skill_count > 5 && (
                        <span className="text-xs text-slate-400">+{c.skill_count - 5}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {c.total_yoe != null ? `${c.total_yoe} yr` : '—'}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_BADGE[c.ingest_status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {c.ingest_status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => removeCandidate(c.id)}
                      className="text-slate-400 hover:text-red-500 text-xs font-semibold"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
