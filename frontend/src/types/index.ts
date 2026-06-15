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
  is_fresher_friendly: boolean
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
  phone: string | null
  resume_text: string | null
  resume_filename: string | null
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

export interface CareerUpgradeArea {
  area: string
  why: string
  sub_skills: string[]
}

export interface CareerProfile {
  detected_role: string
  detected_level_label: string
  next_level_label: string
  strengths: string[]
  weaknesses: string[]
  upgrade_path: CareerUpgradeArea[]
  summary: string
}

export interface VaultResume {
  id: number
  filename: string
  is_primary: boolean
  uploaded_at: string
}

export interface UserProfile {
  id: number
  full_name: string
  email: string
  role: 'recruiter' | 'candidate'
  phone: string | null
  company: string | null
  is_third_party_recruiter: boolean
  linkedin_verified: boolean
  created_at: string | null
  resume_filename: string | null          // null = no resume uploaded yet
  career_profile: CareerProfile | null    // null = not yet analysed (or new resume uploaded)
  career_profile_updated_at: string | null
  resumes: VaultResume[]
}

export interface MagicMatchJob {
  job_id: number
  title: string
  company: string
  location: string
  slug: string | null
  department: string | null
  employment_type: string | null
  remote_policy: string | null
  salary_range_min: number | null
  salary_range_max: number | null
  company_logo_url: string | null
  min_match_score: number
  similarity_score: number  // 0–100
}

export interface MagicMatchResult {
  matches: MagicMatchJob[]
  total: number
  resets_at: string        // ISO date "YYYY-MM-DD"
  message?: string
  from_cache?: boolean
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

export interface RoadmapItem {
  skill_area: string
  current: string
  action: string
  resource_hint?: string
  estimated_gain: number
}

export interface ReadinessRoadmap {
  readiness_score: number
  readiness_label: string
  domain_gap: string | null
  roadmap: RoadmapItem[]
  quick_wins: string[]
  encouragement: string
}

export interface PracticeApplyResult {
  match_score: number
  strengths: string[]
  gaps: string[]
  improvement_suggestions: string[]
  summary: string
  sub_scores?: { skills: number; projects: number; experience: number }
  project_scores?: ProjectScore[]
  scoring_mode?: string
  roadmap_data?: ReadinessRoadmap
  job_title: string
  company: string
  min_match_score: number
  is_fresher_friendly: boolean
}
