import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import JDFormatter from '../components/JDFormatter'
import LoadingSpinner from '../components/LoadingSpinner'
import PracticeApplyModal from '../components/PracticeApplyModal'
import { useAuth } from '../context/AuthContext'
import { Application, Job } from '../types'
import { Button, Card, Icon, Tag } from '../components/ui'
import { formatSalaryRange } from '../utils/currency'

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const { isRecruiter } = useAuth()
  const [job, setJob] = useState<Job | null>(null)
  const [leaderboard, setLeaderboard] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [practiceOpen, setPracticeOpen] = useState(false)

  useEffect(() => {
    const isNumeric = /^\d+$/.test(jobId ?? '')
    const jobFetch = isNumeric
      ? api.get<Job>(`/jobs/${jobId}`)
      : api.get<Job>(`/jobs/slug/${jobId}`)

    jobFetch
      .then(jobRes => {
        setJob(jobRes.data)
        return api.get<Application[]>(`/applications/job/${jobRes.data.id}`)
      })
      .then(appRes => setLeaderboard(appRes.data))
      .catch(() => setError('Failed to load job details.'))
      .finally(() => setLoading(false))
  }, [jobId])

  if (loading) return <LoadingSpinner message="Loading job…" />
  if (error || !job) return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center" style={{ color: 'var(--red-ink)', fontWeight: 600 }}>{error || 'Job not found'}</div>
  )

  const spotsLeft = job.max_count - job.active_applications
  const salary = formatSalaryRange(job.salary_range_min, job.salary_range_max, job.salary_currency)
  const stat = (label: string, value: React.ReactNode) => (
    <div style={{ background: 'var(--surface-2)', borderRadius: 12, border: '1.5px solid var(--line)', padding: '10px 14px' }}>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 17, color: 'var(--ink)', marginTop: 2 }}>{value}</div>
    </div>
  )

  return (
    <>
    {practiceOpen && job && (
      <PracticeApplyModal jobId={job.id} jobTitle={job.title} company={job.company} isFresherFriendly={job.is_fresher_friendly} onClose={() => setPracticeOpen(false)} />
    )}
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      {/* Header banner */}
      <Card hero padding={28} radius={26} style={{ marginBottom: 28, boxShadow: '6px 6px 0 var(--card-shadow)' }}>
        <p style={{ color: 'var(--violet-ink)', fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>{job.company}</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(22px,5vw,34px)', letterSpacing: '-0.03em', color: 'var(--ink)', margin: '0 0 6px' }}>{job.title}</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          <Tag icon="pin">{job.location}</Tag>
          {job.employment_type && <Tag icon="bag">{job.employment_type}</Tag>}
          {job.is_fresher_friendly && <Tag icon="spark" tone="match">Fresher-friendly</Tag>}
          {job.is_campus_hiring && <Tag icon="users" tone="longshot">Campus</Tag>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {stat('Spots left', <span style={{ color: spotsLeft === 0 ? 'var(--red-ink)' : 'var(--green-ink)' }}>{spotsLeft} / {job.max_count}</span>)}
          {stat('Min. match', `${job.min_match_score}%`)}
          {stat('Applicants', job.active_applications)}
          {salary && stat('Compensation', salary)}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* JD */}
        <div className="lg:col-span-2">
          <Card padding={26}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 16px' }}>Job Description</h2>
            <JDFormatter text={job.jd_text} />
          </Card>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          {!isRecruiter && (
            <Card padding={22} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', fontWeight: 600, margin: 0 }}>
                {spotsLeft > 0 ? 'AI screens your resume instantly. Score high to enter the pool.' : 'The pool is full — a high-scoring resume can still displace the lowest-ranked candidate.'}
              </p>
              <Button full size="lg" variant="primary" iconRight="arrow" onClick={() => navigate(`/jobs/${job.id}/apply`)}>Apply now</Button>
              <Button full variant="soft" onClick={() => setPracticeOpen(true)}>✨ Test my chances</Button>
              {job.is_fresher_friendly && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: 'var(--green-ink)', fontWeight: 700 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--green)' }} /> Project-First scoring active
                </div>
              )}
            </Card>
          )}

          {leaderboard.length > 0 && (
            <Card padding={22}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Icon name="trophy" size={18} stroke={2.2} style={{ color: 'var(--violet)' }} />
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>Current top candidates</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {leaderboard.slice(0, 5).map(app => (
                  <div key={app.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 26, textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: app.rank && app.rank <= 3 ? 'var(--violet-ink)' : 'var(--muted)' }}>{app.rank}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {app.candidate_name.split(' ')[0]} {app.candidate_name.split(' ')[1]?.[0] ?? ''}.
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: 'var(--violet)', borderRadius: 99, width: `${app.match_score}%` }} />
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>{app.match_score.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
    </>
  )
}
