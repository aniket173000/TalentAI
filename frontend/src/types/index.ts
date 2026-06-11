export interface AuthUser {
  id: number
  email: string
  full_name: string
  role: 'recruiter' | 'candidate'
  created_at: string
  linkedin_verified: boolean
  company: string | null
  is_third_party_recruiter: boolean
}

export type JobStatus = 'draft' | 'published' | 'closed'
export type EmploymentType = 'Full-time' | 'Part-time' | 'Contract' | 'Internship'
export type RemotePolicy = 'On-site' | 'Remote' | 'Hybrid'
export type EducationLevel = 'None' | 'Diploma' | 'Bachelor' | 'Master' | 'PhD'

export interface EligibilityCriteria {
  min_years_experience: number | null
  required_skills: string[]
  required_education: EducationLevel | null
}

export interface Job {
  id: number
  title: string
  jd_text: string
  company: string
  company_url: string | null
  company_logo_url: string | null
  location: string
  max_count: number
  min_match_score: number
  status: JobStatus
  slug: string | null
  department: string | null
  employment_type: EmploymentType | null
  salary_range_min: number | null
  salary_range_max: number | null
  remote_policy: RemotePolicy | null
  application_deadline: string | null
  published_at: string | null
  created_at: string
  is_third_party: boolean
  total_applicants: number
  active_applications: number
  pool_count: number
  avg_score: number
  eligibility_criteria: EligibilityCriteria | null
}

export interface JobListResponse {
  jobs: Job[]
  total: number
  page: number
  pages: number
  per_page: number
}

export interface JobAuditLog {
  id: number
  field_name: string
  old_value: string | null
  new_value: string | null
  changed_at: string
  actor_name: string
}

export interface ProjectScore {
  project_name: string
  relevance_score: number
  tech_overlap: string[]
  notes: string
}

// AI-set: rejected | pool_accepted
// Recruiter-set: under_review | interview_scheduled | offer_extended | interview_rejected
export type CandidateStatus =
  | 'rejected'
  | 'pool_accepted'
  | 'under_review'
  | 'interview_scheduled'
  | 'offer_extended'
  | 'interview_rejected'

export interface Application {
  id: number
  job_id: number
  candidate_name: string
  candidate_email: string
  match_score: number
  rank: number | null
  status: 'accepted' | 'rejected' | 'displaced'
  candidate_status: CandidateStatus
  status_token: string | null
  strengths: string[] | string | null
  gaps: string[] | string | null
  improvement_suggestions: string[] | string | null
  project_scores: ProjectScore[] | string | null
  applied_at: string
}

export interface ApplyResult {
  status: 'accepted' | 'rejected'
  candidate_status: CandidateStatus
  status_token: string | null
  score_tier?: string | null
  match_score: number
  rank?: number
  total_in_pool?: number
  max_pool?: number
  displaced?: boolean
  message: string
  strengths?: string[]
  gaps?: string[]
  improvement_suggestions?: string[]
  project_scores?: ProjectScore[]
  summary?: string
}
