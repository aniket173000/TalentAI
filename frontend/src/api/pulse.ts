import api from './client'

// ── Types (mirror backend schemas) ───────────────────────────────────────────

export interface Org {
  id: number
  name: string
  cadence: 'weekly' | 'monthly'
  plan: string
  seats_limit: number
  region: 'IN' | 'US'
  active_seats: number
  trial_ends_at: string | null
  created_at: string
}

export interface Seat {
  id: number
  email: string
  full_name: string | null
  role: string
  status: 'invited' | 'active' | 'revoked'
  share_individual_report: boolean
  playbook_attribution: boolean
  connected_at: string | null
  last_seen_at: string | null
  invited_at: string
}

export interface SeatInviteResult {
  seat: Seat
  connect_command: string
}

export interface GapEntry { key: string; label: string; avg: number; rank: number }
export interface TrendPoint { period_label: string; team_index: number | null }
export interface LeaderboardEntry { name: string; overall_score: number; attributed: boolean }

export interface TeamDashboard {
  org_id: number
  period_label: string
  team_index: number | null
  seats_reporting: number
  seats_active: number
  adoption: number
  dimension_averages: Record<string, number>
  gap_heatmap: GapEntry[]
  trend: TrendPoint[]
  leaderboard: LeaderboardEntry[]
}

export interface PlaybookEntry {
  id: number
  period_label: string
  dimension_key: string | null
  technique: string
  evidence: string | null
  attributed_name: string | null
}

export interface PulsePortal {
  org_name: string
  engineer_name: string | null
  cadence: string
  status: string
  consented: boolean
  current_period_label: string
  latest_status: string | null
  connect_command: string
  submit_command: string
}

export interface PulseReport {
  submission_id: number
  period_label: string
  overall_score: number
  summary: string
  dimensions: Array<{ key: string; label: string; score: number | null; confidence: string; note: string; evidence: string[] }>
  highlights: { best_moment?: string; growth_area?: string; coaching_tips?: string[] }
  metrics: Record<string, unknown>
  integrity_flags: Array<{ code: string; detail: string; severity: string }>
  integrity_confidence: string | null
  created_at: string
}

export interface Plan {
  key: string; name: string; seats_limit: number; cadence: string
  price_minor: number; currency: string; features: string[]
}

// ── Org admin (JWT) ───────────────────────────────────────────────────────────

export const listOrgs = () => api.get<Org[]>('/pulse/orgs').then(r => r.data)
export const createOrg = (body: { name: string; cadence: string; region: string }) =>
  api.post<Org>('/pulse/orgs', body).then(r => r.data)
export const listSeats = (orgId: number) =>
  api.get<Seat[]>(`/pulse/orgs/${orgId}/seats`).then(r => r.data)
export const inviteSeats = (orgId: number, emails: string[]) =>
  api.post<SeatInviteResult[]>(`/pulse/orgs/${orgId}/seats`, { emails }).then(r => r.data)
export const offboardSeat = (orgId: number, seatId: number) =>
  api.delete(`/pulse/orgs/${orgId}/seats/${seatId}`)
export const getDashboard = (orgId: number, period?: string) =>
  api.get<TeamDashboard>(`/pulse/orgs/${orgId}/dashboard`, { params: { period } }).then(r => r.data)
export const getPlaybook = (orgId: number, period?: string) =>
  api.get<PlaybookEntry[]>(`/pulse/orgs/${orgId}/playbook`, { params: { period } }).then(r => r.data)
export const closePeriod = (orgId: number, period?: string) =>
  api.post<TeamDashboard>(`/pulse/orgs/${orgId}/close-period`, null, { params: { period } }).then(r => r.data)

// ── Engineer (seat token, no login) ─────────────────────────────────────────

export const getPortal = (token: string) =>
  api.get<PulsePortal>(`/pulse/portal/${token}`).then(r => r.data)
export const setConsent = (token: string, body: { share_individual_report?: boolean; playbook_attribution?: boolean }, fullName?: string) =>
  api.post<PulsePortal>(`/pulse/portal/${token}/consent`, body, { params: { full_name: fullName } }).then(r => r.data)
export const myReport = (token: string, period?: string) =>
  api.get<PulseReport>('/pulse/me/report', { params: { token, period } }).then(r => r.data)

/** Upload this period's .jsonl session files straight from the browser (web
 *  fallback to the CLI). Mirrors the `/portal/{token}/submit` form contract. */
export const submitSessions = (
  token: string, files: File[], workNote?: string,
) => {
  const form = new FormData()
  files.forEach(f => form.append('files', f, f.name))
  form.append('consent', 'true')
  form.append('submit_source', 'web')
  if (workNote) form.append('work_note', workNote)
  return api.post<PulsePortal>(`/pulse/portal/${token}/submit`, form).then(r => r.data)
}

// ── Public ────────────────────────────────────────────────────────────────────

export const listPlans = (region: string) =>
  api.get<Plan[]>('/pulse/plans', { params: { region } }).then(r => r.data)

// ── Early access (waitlist gate) ────────────────────────────────────────────

export interface AccessStatus { has_access: boolean; status: string }

export const getAccess = () => api.get<AccessStatus>('/pulse/access').then(r => r.data)
export const requestEarlyAccess = (b: { email: string; company?: string; team_size?: string; note?: string }) =>
  api.post<AccessStatus>('/pulse/early-access', b).then(r => r.data)

// admin waitlist review
export interface AccessRequestRow {
  id: number; email: string; company: string | null; team_size: string | null
  note: string | null; status: string; created_at: string
}
export const listAccessRequests = () => api.get<AccessRequestRow[]>('/pulse/admin/requests').then(r => r.data)
export const grantAccess = (email: string) => api.post('/pulse/admin/grant', null, { params: { email } })
export const denyAccess = (email: string) => api.post('/pulse/admin/deny', null, { params: { email } })
