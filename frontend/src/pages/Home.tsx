import { useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import CompanyCard from '../components/CompanyCard'
import JobCard from '../components/JobCard'
import LoadingSpinner from '../components/LoadingSpinner'
import { Icon } from '../components/ui'
import { useStudentMode } from '../context/StudentModeContext'
import { Job, JobListResponse } from '../types'

function getBestLogoUrl(companyJobs: Job[]): string | null {
  // Server-resolved logo first (set at job creation time)
  const resolved = companyJobs.find(j => j.company_logo_url)?.company_logo_url
  if (resolved) return resolved
  // Client-side Clearbit fallback
  const url = companyJobs.find(j => j.company_url)?.company_url
  if (!url) return null
  try {
    const full = url.startsWith('http') ? url : `https://${url}`
    const { hostname } = new URL(full)
    if (hostname.includes('linkedin.com')) return null
    return `https://logo.clearbit.com/${hostname}`
  } catch {
    return null
  }
}

export default function Home() {
  const { studentMode, toggleStudentMode } = useStudentMode()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)
  const [jobSearch, setJobSearch] = useState('')
  const [companyLogoError, setCompanyLogoError] = useState(false)

  useEffect(() => {
    api
      .get<JobListResponse>('/jobs/')
      .then(r => setJobs(r.data.jobs))
      .catch(() => setError('Failed to load jobs. Is the backend running?'))
      .finally(() => setLoading(false))
  }, [])

  // Reset logo error when company changes
  useEffect(() => { setCompanyLogoError(false) }, [selectedCompany])

  // Group published jobs by company name
  const companies = useMemo(() => {
    const map = new Map<string, Job[]>()
    jobs.forEach(job => {
      if (!map.has(job.company)) map.set(job.company, [])
      map.get(job.company)!.push(job)
    })
    return Array.from(map.entries()).map(([name, companyJobs]) => ({ name, jobs: companyJobs }))
  }, [jobs])

  const filteredCompanies = useMemo(() => {
    if (!search.trim()) return companies
    const q = search.toLowerCase()
    return companies.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.jobs.some(j => j.title.toLowerCase().includes(q))
    )
  }, [companies, search])

  // Jobs for selected company, filtered by job-level search
  const selectedCompanyJobs = useMemo(() => {
    if (!selectedCompany) return []
    const companyJobs = jobs.filter(j => j.company === selectedCompany)
    if (!jobSearch.trim()) return companyJobs
    const q = jobSearch.toLowerCase()
    return companyJobs.filter(
      j =>
        j.title.toLowerCase().includes(q) ||
        (j.department ?? '').toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q)
    )
  }, [selectedCompany, jobs, jobSearch])

  const selectedCompanyData = selectedCompany
    ? companies.find(c => c.name === selectedCompany)
    : null

  // ── Loading / error ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-24">
        <LoadingSpinner message="Loading companies…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm text-center">
          {error}
        </div>
      </div>
    )
  }

  // ── Company detail view ─────────────────────────────────────────────────────
  if (selectedCompany && selectedCompanyData) {
    const companyUrl = selectedCompanyData.jobs.find(j => j.company_url)?.company_url
    const logoUrl = getBestLogoUrl(selectedCompanyData.jobs)
    const displayUrl = companyUrl
      ? companyUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
      : null

    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Back breadcrumb */}
        <button
          onClick={() => { setSelectedCompany(null); setJobSearch('') }}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-8 transition-colors group"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All Companies
          <span className="text-slate-300">/</span>
          <span className="text-slate-800 font-semibold">{selectedCompany}</span>
        </button>

        {/* Company header banner */}
        <div className="mb-10 flex flex-col sm:flex-row items-start sm:items-center gap-6" style={{ background: 'var(--hero)', border: '2px solid var(--ink)', borderRadius: 26, boxShadow: '6px 6px 0 var(--card-shadow)', padding: 28 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--surface)', border: '2px solid var(--ink)', boxShadow: '3px 3px 0 var(--ink)', display: 'grid', placeItems: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {logoUrl && !companyLogoError ? (
              <img src={logoUrl} alt={selectedCompany} style={{ width: 48, height: 48, objectFit: 'contain' }} onError={() => setCompanyLogoError(true)} />
            ) : (
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: 'var(--violet-ink)' }}>{selectedCompany.slice(0, 2).toUpperCase()}</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, letterSpacing: '-0.03em', color: 'var(--ink)', margin: 0 }}>{selectedCompany}</h1>
            {displayUrl && (
              <a href={companyUrl!.startsWith('http') ? companyUrl! : `https://${companyUrl}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--violet-ink)', fontSize: 13.5, fontWeight: 700, marginTop: 4, textDecoration: 'none' }}>
                🔗 {displayUrl}
              </a>
            )}
            <p style={{ color: 'var(--muted)', fontSize: 14, fontWeight: 600, marginTop: 6 }}>
              {selectedCompanyData.jobs.length} open position{selectedCompanyData.jobs.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[...new Set(selectedCompanyData.jobs.map(j => j.remote_policy).filter(Boolean))].map(p => (
              <span key={p} style={{ background: 'var(--surface)', color: 'var(--ink)', fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 99, border: '2px solid var(--line)' }}>{p}</span>
            ))}
          </div>
        </div>

        {/* Job filter */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 max-w-sm" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', background: 'var(--surface)', border: '2px solid var(--line)', borderRadius: 99 }}>
            <Icon name="search" size={16} stroke={2.2} style={{ color: 'var(--muted)' }} />
            <input type="text" value={jobSearch} onChange={e => setJobSearch(e.target.value)} placeholder="Filter by role, department…"
              style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--ink)', width: '100%' }} />
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600 }}>{selectedCompanyJobs.length} role{selectedCompanyJobs.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Job grid */}
        {selectedCompanyJobs.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-4xl mb-3">🔍</p>
            <p className="font-medium">No roles match your search.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {selectedCompanyJobs.map(job => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Company grid view ───────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-4 py-12">

      {/* Student Mode Banner */}
      {studentMode && (
        <div className="mb-8 flex items-center justify-between gap-4" style={{ background: 'var(--violet-soft)', border: '2px solid var(--ink)', borderRadius: 18, boxShadow: '4px 4px 0 var(--card-shadow)', padding: '16px 22px' }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎓</span>
            <div>
              <p style={{ color: 'var(--ink)', fontWeight: 800, fontSize: 14, margin: 0, fontFamily: 'var(--font-display)' }}>Student Mode is ON</p>
              <p style={{ color: 'var(--violet-ink)', fontSize: 12, margin: '2px 0 0', fontWeight: 600 }}>Readiness roadmaps · Project-First scoring · "Test My Chances" on every job</p>
            </div>
          </div>
          <button onClick={toggleStudentMode} className="shrink-0 text-xs font-bold rounded-full px-3 py-1.5" style={{ background: 'var(--surface)', color: 'var(--violet-ink)', border: '2px solid var(--violet-line)' }}>
            Turn Off
          </button>
        </div>
      )}

      {/* Hero */}
      <div className="text-center mb-10">
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 44, letterSpacing: '-0.035em', color: 'var(--ink)', margin: '0 0 12px', lineHeight: 1.04 }}>Explore top companies</h1>
        <p className="max-w-xl mx-auto" style={{ color: 'var(--muted)', fontSize: 17, fontWeight: 500, lineHeight: 1.5 }}>
          Discover who's hiring. Click a company to see their open roles — and apply in seconds with AI-powered screening.
        </p>
      </div>

      {/* Search */}
      <div className="max-w-lg mx-auto mb-10" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 16px', background: 'var(--surface)', border: '2px solid var(--ink)', borderRadius: 16, boxShadow: '3px 3px 0 var(--card-shadow)' }}>
        <Icon name="search" size={18} stroke={2.2} style={{ color: 'var(--muted)' }} />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies or roles…"
          style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 14.5, color: 'var(--ink)', width: '100%' }} />
      </div>

      {/* Summary */}
      {companies.length > 0 && (
        <p className="text-center mb-8" style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600 }}>
          <span style={{ color: 'var(--ink)', fontWeight: 800 }}>{filteredCompanies.length}</span> compan{filteredCompanies.length !== 1 ? 'ies' : 'y'} hiring
          &nbsp;·&nbsp;
          <span style={{ color: 'var(--ink)', fontWeight: 800 }}>{jobs.length}</span> open position{jobs.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Empty state */}
      {jobs.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <p className="text-5xl mb-4">📭</p>
          <p className="text-lg font-medium text-slate-500">No open positions yet.</p>
          <p className="text-sm mt-1">Check back soon or visit the Recruiter Portal to post a role.</p>
        </div>
      )}

      {filteredCompanies.length === 0 && jobs.length > 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">🔍</p>
          <p className="font-medium text-slate-500">No companies match "{search}".</p>
          <button onClick={() => setSearch('')} className="mt-2 text-brand-blue text-sm hover:underline">
            Clear search
          </button>
        </div>
      )}

      {/* Company cards grid */}
      {filteredCompanies.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCompanies.map(company => (
            <CompanyCard
              key={company.name}
              name={company.name}
              jobs={company.jobs}
              onSelect={() => setSelectedCompany(company.name)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
