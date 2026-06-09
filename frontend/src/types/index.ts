export interface Job {
  id: number
  title: string
  jd_text: string
  company: string
  location: string
  max_count: number
  min_match_score: number
  created_at: string
  active_applications: number
}

export interface Application {
  id: number
  job_id: number
  candidate_name: string
  candidate_email: string
  match_score: number
  rank: number | null
  status: 'accepted' | 'rejected' | 'displaced'
  strengths: string[] | string | null
  gaps: string[] | string | null
  improvement_suggestions: string[] | string | null
  applied_at: string
}

export interface ApplyResult {
  status: 'accepted' | 'rejected'
  match_score: number
  rank?: number
  total_in_pool?: number
  max_pool?: number
  displaced?: boolean
  message: string
  strengths?: string[]
  gaps?: string[]
  improvement_suggestions?: string[]
  summary?: string
}
