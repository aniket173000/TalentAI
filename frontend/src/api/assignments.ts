import api from './client'

// ── Types (mirror backend schemas) ───────────────────────────────────────────

export interface Assignment {
  id: number
  job_id: number
  title: string
  brief: string
  evaluation_focus: string | null
  deadline: string | null
  required_tool: string
  status: 'active' | 'closed'
  created_at: string
  submission_counts: Record<string, number>
}

export interface Submission {
  id: number
  assignment_id: number
  application_id: number | null
  candidate_name: string
  candidate_email: string
  status: 'invited' | 'submitted' | 'processing' | 'analyzed' | 'failed'
  error: string | null
  session_count: number | null
  repo_url: string | null
  invited_at: string
  submitted_at: string | null
  analyzed_at: string | null
  overall_score: number | null
  integrity_confidence: 'high' | 'medium' | 'low' | null
  mcp_connected_at: string | null
  mcp_last_seen_at: string | null
}

export interface ReportDimension {
  key: string
  label: string
  score: number | null
  confidence: 'high' | 'medium' | 'low'
  note: string
  evidence: string[]
}

export interface FluencyReport {
  submission_id: number
  candidate_name: string
  overall_score: number
  summary: string
  dimensions: ReportDimension[]
  highlights: { best_moment?: string; growth_area?: string; interview_questions?: string[] }
  metrics: Record<string, any>
  integrity_flags: { code: string; severity: string; detail: string }[]
  integrity_confidence: 'high' | 'medium' | 'low' | null
  provider: string | null
  chunk_model: string | null
  aggregate_model: string | null
  created_at: string
}

export interface CandidateAssignmentView {
  assignment_title: string
  brief: string
  deadline: string | null
  required_tool: string
  company: string
  job_title: string
  candidate_name: string
  status: string
  submitted_at: string | null
  assignment_open: boolean
}

// ── Recruiter ────────────────────────────────────────────────────────────────

export const createAssignment = (payload: {
  job_id: number; title: string; brief: string
  evaluation_focus?: string; deadline?: string
}) => api.post<Assignment>('/assignments', payload).then(r => r.data)

export const listAssignments = (jobId: number) =>
  api.get<Assignment[]>('/assignments', { params: { job_id: jobId } }).then(r => r.data)

export const updateAssignment = (id: number, payload: Partial<Pick<Assignment,
  'title' | 'brief' | 'evaluation_focus' | 'deadline' | 'status'>>) =>
  api.patch<Assignment>(`/assignments/${id}`, payload).then(r => r.data)

export const inviteCandidates = (assignmentId: number, payload: {
  application_ids?: number[]; emails?: string[]
}) => api.post<Submission[]>(`/assignments/${assignmentId}/invite`, payload).then(r => r.data)

export const listSubmissions = (assignmentId: number) =>
  api.get<Submission[]>(`/assignments/${assignmentId}/submissions`).then(r => r.data)

export const getReport = (submissionId: number) =>
  api.get<FluencyReport>(`/assignments/submissions/${submissionId}/report`).then(r => r.data)

export const retryAnalysis = (submissionId: number) =>
  api.post<Submission>(`/assignments/submissions/${submissionId}/retry`).then(r => r.data)

// ── Candidate portal (tokenized, no auth) ────────────────────────────────────

export const getPortal = (token: string) =>
  api.get<CandidateAssignmentView>(`/assignments/portal/${token}`).then(r => r.data)

export const submitTranscripts = (token: string, files: File[], repoUrl: string) => {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  form.append('repo_url', repoUrl)
  form.append('consent', 'true')
  return api.post<CandidateAssignmentView>(
    `/assignments/portal/${token}/submit`, form,
    { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300_000 },
  ).then(r => r.data)
}
