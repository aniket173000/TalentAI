import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import { useAuth } from '../context/AuthContext'
import { Job } from '../types'

export default function Apply() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [job, setJob] = useState<Job | null>(null)
  // Pre-fill from auth profile; candidate can still override
  const [name, setName] = useState(user?.full_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get<Job>(`/jobs/${jobId}`)
      .then(r => setJob(r.data))
      .catch(() => setError('Job not found.'))
  }, [jobId])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) { setError('Please upload your resume.'); return }
    if (!name.trim() || !email.trim()) { setError('Name and email are required.'); return }

    setError('')
    setSubmitting(true)

    const formData = new FormData()
    formData.append('candidate_name', name.trim())
    formData.append('candidate_email', email.trim())
    formData.append('resume_file', file)

    try {
      const res = await api.post(`/applications/apply/${jobId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      navigate('/result', { state: { result: res.data, jobTitle: job?.title } })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitting) {
    return (
      <div className="max-w-md mx-auto px-4 py-20">
        <LoadingSpinner message="AI is analysing your resume… this may take 10–20 seconds." />
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-12 animate-fade-in">
      <Link to={`/jobs/${jobId}`} className="text-sm text-brand-blue hover:underline mb-6 block">
        ← Back to job
      </Link>

      {job && (
        <div className="mb-8">
          <p className="text-slate-500 text-sm">{job.company}</p>
          <h1 className="text-2xl font-extrabold text-navy-900">{job.title}</h1>
          <p className="text-slate-400 text-sm mt-1">
            Min. match: {job.min_match_score}% · Pool: {job.active_applications}/{job.max_count}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-8 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Full Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Jane Smith"
            required
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="jane@example.com"
            required
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Resume</label>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-brand-blue bg-blue-50'
                : file
                ? 'border-emerald-300 bg-emerald-50'
                : 'border-slate-200 hover:border-brand-blue hover:bg-blue-50/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
            {file ? (
              <div className="text-emerald-600">
                <p className="text-2xl mb-1">✓</p>
                <p className="font-semibold text-sm">{file.name}</p>
                <p className="text-xs mt-0.5 text-emerald-500">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
            ) : (
              <div className="text-slate-400">
                <p className="text-3xl mb-2">📄</p>
                <p className="text-sm font-medium">
                  Drop your resume here or <span className="text-brand-blue">browse</span>
                </p>
                <p className="text-xs mt-1">PDF, DOCX, or TXT · Max 10MB</p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-brand-blue hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg py-3 transition-colors"
        >
          Submit Application
        </button>

        <p className="text-xs text-slate-400 text-center">
          Our AI will score your resume instantly against the job description. You'll see your result immediately.
        </p>
      </form>
    </div>
  )
}
