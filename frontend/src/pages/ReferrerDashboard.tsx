import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import { ReferralPoolCandidate, ReferralPoolResponse, ReferralPost } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    closed: 'bg-amber-50 text-amber-700 border-amber-100',
    referring: 'bg-blue-50 text-blue-700 border-blue-100',
    referred_all: 'bg-slate-50 text-slate-600 border-slate-200',
    draft: 'bg-slate-50 text-muted border-slate-100',
  }
  const labels: Record<string, string> = {
    open: 'Open', closed: 'Closed', referring: 'Referring', referred_all: 'Referred All', draft: 'Draft',
  }
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${map[status] ?? 'bg-slate-50 text-muted border-slate-100'}`}>
      {labels[status] ?? status}
    </span>
  )
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-rose-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-600 w-10 text-right">{score.toFixed(0)}%</span>
    </div>
  )
}

function CandidateCard({
  app,
  onRemove,
  removing,
}: {
  app: ReferralPoolCandidate
  onRemove: (id: number) => void
  removing: boolean
}) {
  const c = app.candidate
  const initials = c?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  return (
    <div className={`bg-white border border-slate-100 rounded-2xl p-4 hover:shadow-sm transition-all ${removing ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm">
          {c?.college_logo_url
            ? <img src={c.college_logo_url} alt="" className="w-full h-full object-cover rounded-xl" />
            : initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink text-sm truncate">{c?.full_name ?? 'Candidate'}</span>
            {app.rank && (
              <span className="flex-shrink-0 text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full font-medium">
                #{app.rank}
              </span>
            )}
          </div>
          {c?.college_name && (
            <p className="text-xs text-muted mt-0.5 truncate">{c.college_name}</p>
          )}
          {c?.current_company && (
            <p className="text-xs text-muted truncate">{c.current_company}</p>
          )}
        </div>

        <button
          onClick={() => onRemove(app.id)}
          className="flex-shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
          title="Remove from pool"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="mt-3">
        <ScoreBar score={app.match_score} />
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {c?.candidate_linkedin_url && (
          <a
            href={c.candidate_linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
            LinkedIn
          </a>
        )}
        <span className="text-xs text-muted">
          Applied {app.applied_at ? new Date(app.applied_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
        </span>
      </div>
    </div>
  )
}

// ── My Posts sidebar ──────────────────────────────────────────────────────────

function MyPostItem({ post, active, onClick }: { post: ReferralPost; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 rounded-xl transition-all ${
        active ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-slate-50 border border-transparent'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-sm font-semibold truncate ${active ? 'text-indigo-700' : 'text-slate-700'}`}>{post.title}</p>
          <p className="text-xs text-muted mt-0.5">{post.pool_count}/{post.pool_size} filled</p>
        </div>
        <StatusBadge status={post.status} />
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReferrerDashboard() {
  const { postId } = useParams<{ postId?: string }>()
  const navigate = useNavigate()

  const [myPosts, setMyPosts] = useState<ReferralPost[]>([])
  const [postsLoading, setPostsLoading] = useState(true)
  const [activePostId, setActivePostId] = useState<number | null>(postId ? parseInt(postId) : null)
  const [poolData, setPoolData] = useState<ReferralPoolResponse | null>(null)
  const [poolLoading, setPoolLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [removingIds, setRemovingIds] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [confirmAction, setConfirmAction] = useState<null | 'close' | 'referring' | 'referred_all'>(null)

  // Load my posts
  useEffect(() => {
    api.get<ReferralPost[]>('/referrals/posts/my')
      .then(r => {
        setMyPosts(r.data)
        if (!activePostId && r.data.length > 0) setActivePostId(r.data[0].id)
      })
      .finally(() => setPostsLoading(false))
  }, [])

  // Load pool when active post changes
  useEffect(() => {
    if (!activePostId) return
    setPoolLoading(true)
    setError('')
    api.get<ReferralPoolResponse>(`/referrals/posts/${activePostId}/pool`)
      .then(r => setPoolData(r.data))
      .catch(() => setError('Failed to load pool data.'))
      .finally(() => setPoolLoading(false))
  }, [activePostId])

  const handleRemove = async (appId: number) => {
    if (!activePostId) return
    setRemovingIds(s => new Set(s).add(appId))
    try {
      await api.delete(`/referrals/posts/${activePostId}/candidates/${appId}`)
      const r = await api.get<ReferralPoolResponse>(`/referrals/posts/${activePostId}/pool`)
      setPoolData(r.data)
    } catch {
      setError('Failed to remove candidate.')
    } finally {
      setRemovingIds(s => { const ns = new Set(s); ns.delete(appId); return ns })
    }
  }

  const handleLifecycleAction = async (action: 'close' | 'referring' | 'referred_all') => {
    if (!activePostId) return
    setActionLoading(true); setError('')
    try {
      const endpoints: Record<string, string> = {
        close: `/referrals/posts/${activePostId}/close`,
        referring: `/referrals/posts/${activePostId}/referring`,
        referred_all: `/referrals/posts/${activePostId}/referred-all`,
      }
      await api.post(endpoints[action], {})
      const [postsRes, poolRes] = await Promise.all([
        api.get<ReferralPost[]>('/referrals/posts/my'),
        api.get<ReferralPoolResponse>(`/referrals/posts/${activePostId}/pool`),
      ])
      setMyPosts(postsRes.data)
      setPoolData(poolRes.data)
    } catch {
      setError('Action failed. Please try again.')
    } finally {
      setActionLoading(false); setConfirmAction(null)
    }
  }

  const activePost = poolData?.post ?? myPosts.find(p => p.id === activePostId)
  const postStatus = activePost?.status

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink">Referral Dashboard</h1>
            <p className="text-muted text-sm mt-0.5">Manage your referral pools and refer candidates</p>
          </div>
          <button
            onClick={() => navigate('/referrals/create')}
            className="flex items-center gap-2 bg-accent hover:opacity-90 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Post
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 flex gap-6">

        {/* Sidebar — my posts */}
        <div className="w-64 flex-shrink-0 space-y-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide px-1 mb-3">Your Posts</p>
          {postsLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : myPosts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted">No posts yet.</p>
              <button onClick={() => navigate('/referrals/create')} className="text-accent-ink text-sm hover:underline mt-1">Create one</button>
            </div>
          ) : (
            myPosts.map(post => (
              <MyPostItem
                key={post.id}
                post={post}
                active={post.id === activePostId}
                onClick={() => { setActivePostId(post.id); navigate(`/referrals/dashboard/${post.id}`) }}
              />
            ))
          )}
        </div>

        {/* Main panel */}
        <div className="flex-1 min-w-0">
          {error && (
            <div className="mb-4 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 text-sm text-rose-700">{error}</div>
          )}

          {!activePostId ? (
            <div className="text-center py-24 text-muted">
              <p className="text-lg font-medium text-muted">Select a post to manage</p>
            </div>
          ) : poolLoading ? (
            <div className="flex justify-center py-24"><LoadingSpinner /></div>
          ) : poolData ? (
            <div className="space-y-5">

              {/* Post header */}
              <div className="bg-white border border-slate-100 rounded-2xl p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold text-ink">{poolData.post.title}</h2>
                      <StatusBadge status={poolData.post.status} />
                    </div>
                    <p className="text-muted text-sm mt-1">{poolData.post.company_name}</p>
                  </div>

                  {/* Action buttons based on lifecycle state */}
                  <div className="flex gap-2 flex-wrap">
                    {postStatus === 'open' && (
                      <button
                        onClick={() => setConfirmAction('close')}
                        className="px-4 py-2 text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 rounded-xl transition-colors"
                      >
                        Close Pool
                      </button>
                    )}
                    {postStatus === 'closed' && (
                      <button
                        onClick={() => setConfirmAction('referring')}
                        className="px-4 py-2 text-sm font-medium bg-accent text-white hover:opacity-90 rounded-xl transition-colors"
                      >
                        Mark as Referring
                      </button>
                    )}
                    {postStatus === 'referring' && (
                      <button
                        onClick={() => setConfirmAction('referred_all')}
                        className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl transition-colors"
                      >
                        Mark Referred All
                      </button>
                    )}
                  </div>
                </div>

                {/* Stats strip */}
                <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Applicants', value: poolData.stats.total_applicants, color: 'text-ink' },
                    { label: 'In Pool', value: `${poolData.stats.pool_count}/${poolData.stats.pool_capacity}`, color: 'text-indigo-700' },
                    { label: 'Waitlist', value: `${poolData.stats.waitlist_count}/${poolData.stats.waitlist_capacity}`, color: 'text-amber-700' },
                    { label: 'Spots Left', value: poolData.stats.pool_capacity - poolData.stats.pool_count, color: 'text-emerald-700' },
                  ].map(stat => (
                    <div key={stat.label} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                      <p className="text-xs text-muted">{stat.label}</p>
                      <p className={`text-xl font-bold mt-0.5 ${stat.color}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>

                {poolData.post.closes_at && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {postStatus === 'open'
                      ? `Auto-closes ${new Date(poolData.post.closes_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : `Closed on ${new Date(poolData.post.closes_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    }
                  </div>
                )}
              </div>

              {/* Pool grid */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-semibold text-slate-700">Referral Pool</h3>
                  <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full">
                    {poolData.pool.length} / {poolData.stats.pool_capacity}
                  </span>
                </div>
                {poolData.pool.length === 0 ? (
                  <div className="text-center py-12 bg-surface rounded-2xl border-2 border-ink shadow-card text-muted">
                    <p className="text-sm">No candidates in the pool yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {poolData.pool.map(app => (
                      <CandidateCard
                        key={app.id}
                        app={app}
                        onRemove={handleRemove}
                        removing={removingIds.has(app.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Waitlist */}
              {poolData.stats.waitlist_capacity > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-semibold text-slate-700">Waitlist</h3>
                    <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full">
                      {poolData.waitlist.length} / {poolData.stats.waitlist_capacity}
                    </span>
                  </div>
                  {poolData.waitlist.length === 0 ? (
                    <div className="text-center py-8 bg-surface rounded-2xl border-2 border-ink shadow-card text-muted">
                      <p className="text-sm">Waitlist is empty.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {poolData.waitlist.map(app => (
                        <CandidateCard
                          key={app.id}
                          app={app}
                          onRemove={handleRemove}
                          removing={removingIds.has(app.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Confirm modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-ink text-lg">
              {confirmAction === 'close' && 'Close the referral pool?'}
              {confirmAction === 'referring' && 'Mark as Referring?'}
              {confirmAction === 'referred_all' && 'Mark as Referred All?'}
            </h3>
            <p className="text-muted text-sm">
              {confirmAction === 'close' && 'No new candidates can apply after closing. You can then review the pool and begin referring.'}
              {confirmAction === 'referring' && 'This signals that you\'ve started submitting referrals to your company.'}
              {confirmAction === 'referred_all' && 'All pool candidates will receive a referral confirmation email. This action cannot be undone.'}
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-2.5 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleLifecycleAction(confirmAction)}
                disabled={actionLoading}
                className={`flex-1 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-50 ${
                  confirmAction === 'referred_all' ? 'bg-emerald-600 hover:bg-emerald-700' :
                  confirmAction === 'referring' ? 'bg-accent hover:opacity-90' :
                  'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {actionLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
