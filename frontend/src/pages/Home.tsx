import { useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import CompanyCard from '../components/CompanyCard'
import JobCard from '../components/JobCard'
import LoadingSpinner from '../components/LoadingSpinner'
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

        {/* Company header card */}
        <div className="relative bg-gradient-to-r from-navy-900 via-slate-800 to-navy-900 rounded-2xl overflow-hidden mb-10 shadow-xl">
          {/* decorative circles */}
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-brand-blue/10" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-brand-teal/10" />

          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6 p-8">
            {/* Logo */}
            <div className="w-20 h-20 rounded-2xl bg-white shadow-lg flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl && !companyLogoError ? (
                <img
                  src={logoUrl}
                  alt={selectedCompany}
                  className="w-14 h-14 object-contain"
                  onError={() => setCompanyLogoError(true)}
                />
              ) : (
                <span className="text-3xl font-black text-brand-blue">
                  {selectedCompany.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            {/* Company info */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-extrabold text-white leading-tight">{selectedCompany}</h1>
              {displayUrl && (
                <a
                  href={companyUrl!.startsWith('http') ? companyUrl! : `https://${companyUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 text-brand-teal text-sm mt-1 hover:underline"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  {displayUrl}
                </a>
              )}
              <p className="text-slate-400 text-sm mt-2">
                {selectedCompanyData.jobs.length} open position{selectedCompanyData.jobs.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Stats pills */}
            <div className="flex flex-wrap gap-2">
              {[...new Set(selectedCompanyData.jobs.map(j => j.remote_policy).filter(Boolean))].map(p => (
                <span key={p} className="bg-white/10 text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20">
                  {p}
                </span>
              ))}
              {[...new Set(selectedCompanyData.jobs.map(j => j.location))].slice(0, 2).map(l => (
                <span key={l} className="bg-white/10 text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20">
                  📍 {l}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Job filter */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={jobSearch}
              onChange={e => setJobSearch(e.target.value)}
              placeholder="Filter by role, department…"
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition bg-white"
            />
          </div>
          <p className="text-sm text-slate-400">
            {selectedCompanyJobs.length} role{selectedCompanyJobs.length !== 1 ? 's' : ''}
          </p>
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
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-navy-900 mb-3">Explore Top Companies</h1>
        <p className="text-slate-500 text-lg max-w-xl mx-auto">
          Discover who's hiring. Click a company to see their open roles — and apply in seconds with AI-powered screening.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-lg mx-auto mb-10">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search companies or roles…"
          className="w-full pl-12 pr-4 py-3.5 text-sm border border-slate-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition bg-white"
        />
      </div>

      {/* Summary */}
      {companies.length > 0 && (
        <p className="text-sm text-slate-400 text-center mb-8">
          <span className="font-semibold text-slate-600">{filteredCompanies.length}</span> compan{filteredCompanies.length !== 1 ? 'ies' : 'y'} hiring
          &nbsp;·&nbsp;
          <span className="font-semibold text-slate-600">{jobs.length}</span> open position{jobs.length !== 1 ? 's' : ''}
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
