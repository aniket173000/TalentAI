import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import { ReferralCompany } from '../types'

function CompanyCard({ company, onClick }: { company: ReferralCompany; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all duration-200 p-6 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold flex-shrink-0 shadow-sm">
            {company.company_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800 text-base truncate group-hover:text-indigo-600 transition-colors">
              {company.company_name}
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {company.open_referral_count} open referral{company.open_referral_count !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <span className="flex-shrink-0 inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-medium px-2.5 py-1 rounded-full border border-emerald-100">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Active
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-1">
        {company.job_titles.slice(0, 3).map(title => (
          <span
            key={title}
            className="text-xs bg-slate-50 text-slate-600 px-2.5 py-1 rounded-lg border border-slate-100"
          >
            {title}
          </span>
        ))}
        {company.job_titles.length > 3 && (
          <span className="text-xs text-slate-400 px-2 py-1">
            +{company.job_titles.length - 3} more
          </span>
        )}
      </div>
    </button>
  )
}

export default function CompanyReferrals() {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState<ReferralCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get<ReferralCompany[]>('/referrals/companies')
      .then(r => setCompanies(r.data))
      .catch(() => setError('Failed to load referral companies.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = companies.filter(c =>
    !search.trim() ||
    c.company_name.toLowerCase().includes(search.toLowerCase()) ||
    c.job_titles.some(t => t.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 text-white">
        <div className="max-w-5xl mx-auto px-4 py-16 sm:py-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm text-white text-sm font-medium px-4 py-1.5 rounded-full mb-5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Employee Referrals
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
              Get referred by real employees
            </h1>
            <p className="mt-4 text-lg text-indigo-100 leading-relaxed">
              Skip the cold outreach. Find employees at your dream companies who are actively ready to refer strong candidates — and apply directly to their referral pool.
            </p>
          </div>

          {/* Search */}
          <div className="mt-8 max-w-lg">
            <div className="relative">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search companies or roles..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white/15 backdrop-blur-sm text-white placeholder-indigo-200 border border-white/20 rounded-xl pl-12 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-white/40 focus:bg-white/20 transition-all text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-10">
        {loading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : error ? (
          <div className="text-center py-16 text-slate-500">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-2">
              {search ? 'No companies match your search' : 'No active referrals yet'}
            </h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">
              {search ? 'Try a different company name or role title.' : 'Check back soon — employees at top companies are joining.'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-700">
                {filtered.length} {filtered.length === 1 ? 'company' : 'companies'} with open referrals
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(company => (
                <CompanyCard
                  key={company.company_name}
                  company={company}
                  onClick={() => navigate(`/referrals/company/${encodeURIComponent(company.company_name)}`)}
                />
              ))}
            </div>
          </>
        )}

        {/* CTA for employees */}
        <div className="mt-16 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-8 flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-800">Are you an employee willing to refer?</h3>
            <p className="text-slate-500 text-sm mt-1.5">
              Create a referral post for your company and get matched with the strongest candidates automatically.
            </p>
          </div>
          <button
            onClick={() => navigate('/referrals/create')}
            className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-2.5 rounded-xl transition-colors shadow-sm text-sm"
          >
            Create Referral Post
          </button>
        </div>
      </div>
    </div>
  )
}
