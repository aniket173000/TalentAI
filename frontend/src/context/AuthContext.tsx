import React, { createContext, useContext, useEffect, useState } from 'react'
import api from '../api/client'
import { AuthUser } from '../types'

export type ActiveMode = 'recruiter' | 'candidate'

interface AddCapabilityOptions {
  company?: string
  isThirdParty?: boolean
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  /** The UI mode the user is currently viewing — 'recruiter' or 'candidate'. */
  activeMode: ActiveMode | null
  /** Switch the displayed mode (no API call — purely a UI preference). */
  switchMode: (mode: ActiveMode) => void
  /** Add a new capability (recruiter or candidate) to the current account. */
  addCapability: (accountType: ActiveMode, opts?: AddCapabilityOptions) => Promise<void>

  login: (email: string, password: string) => Promise<void>
  /** Dev-only: log in as a persistent local test user, bypassing Google/LinkedIn OAuth entirely. */
  loginWithDev: (accountType: ActiveMode) => Promise<void>
  /** Step 1 of signup — emails an OTP. No account is created yet. */
  sendSignupOtp: (
    email: string,
    password: string,
    fullName: string,
    accountType: ActiveMode,
    company?: string | null,
    isThirdParty?: boolean,
  ) => Promise<void>
  /** Step 2 of signup — confirms the OTP, creating + logging in the account. */
  verifySignupOtp: (email: string, otpCode: string, accountType: ActiveMode) => Promise<void>
  /** Re-send the signup OTP for a pending registration. */
  resendSignupOtp: (email: string) => Promise<void>
  /** Redirect browser to LinkedIn OAuth. Pass 'login' to sign in without forcing a role. */
  loginWithLinkedIn: (accountType: ActiveMode | 'login') => void
  /** Store the token returned from LinkedIn callback and fetch the user. */
  completeLinkedInLogin: (token: string, accountType: ActiveMode) => Promise<void>
  /** Redirect browser to Google OAuth. Pass 'login' to sign in without forcing a role. */
  loginWithGoogle: (accountType: ActiveMode | 'login') => void
  /** Store the token returned from the Google callback and fetch the user. */
  completeGoogleLogin: (token: string, accountType: ActiveMode) => Promise<void>
  logout: () => void
  /** Re-fetch /auth/me and update user in context. */
  refreshUser: () => Promise<void>

  isAuthenticated: boolean
  isRecruiter: boolean
  isCandidate: boolean
  /** True when user has both recruiter and candidate extensions. */
  isDualMode: boolean
}

const AuthContext = createContext<AuthContextType>(null!)

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveDefaultMode(user: AuthUser): ActiveMode {
  const saved = localStorage.getItem('active_mode') as ActiveMode | null
  if (saved === 'recruiter' && user.is_recruiter) return 'recruiter'
  if (saved === 'candidate' && user.is_candidate) return 'candidate'
  // Fall back to whichever capability they have
  if (user.is_recruiter) return 'recruiter'
  if (user.is_candidate) return 'candidate'
  return 'candidate'
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [activeMode, setActiveModeState] = useState<ActiveMode | null>(null)
  const [loading, setLoading] = useState(true)

  // Restore session on mount; migrate legacy role-keyed tokens if present
  useEffect(() => {
    const migrateIfNeeded = () => {
      // If someone has the old role-keyed tokens but no new single token, migrate
      const legacyRole = localStorage.getItem('active_role') as ActiveMode | null
      const legacyToken = legacyRole
        ? localStorage.getItem(`auth_token_${legacyRole}`)
        : localStorage.getItem('auth_token')
      const newToken = localStorage.getItem('auth_token')

      if (!newToken && legacyToken) {
        localStorage.setItem('auth_token', legacyToken)
        if (legacyRole) localStorage.setItem('active_mode', legacyRole)
        // Clean up legacy keys
        ;(['recruiter', 'candidate'] as ActiveMode[]).forEach(r => {
          localStorage.removeItem(`auth_token_${r}`)
        })
        localStorage.removeItem('active_role')
        return legacyToken
      }
      return newToken
    }

    const token = migrateIfNeeded()
    if (!token) {
      setLoading(false)
      return
    }

    api
      .get<AuthUser>('/auth/me')
      .then(r => {
        setUser(r.data)
        setActiveModeState(resolveDefaultMode(r.data))
      })
      .catch(() => {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('active_mode')
      })
      .finally(() => setLoading(false))
  }, [])

  const switchMode = (mode: ActiveMode) => {
    if (!user) return
    if (mode === 'recruiter' && !user.is_recruiter) return
    if (mode === 'candidate' && !user.is_candidate) return
    localStorage.setItem('active_mode', mode)
    setActiveModeState(mode)
  }

  const addCapability = async (accountType: ActiveMode, opts: AddCapabilityOptions = {}) => {
    const params = new URLSearchParams({ account_type: accountType })
    if (opts.company) params.set('company', opts.company)
    if (opts.isThirdParty) params.set('is_third_party', 'true')
    await api.post(`/auth/add-capability?${params}`)
    const r = await api.get<AuthUser>('/auth/me')
    setUser(r.data)
    // Switch into the newly added mode
    switchMode(accountType)
  }

  const login = async (email: string, password: string) => {
    const r = await api.post<{ access_token: string; user: AuthUser }>('/auth/login', {
      email,
      password,
    })
    localStorage.setItem('auth_token', r.data.access_token)
    setUser(r.data.user)
    const mode = resolveDefaultMode(r.data.user)
    localStorage.setItem('active_mode', mode)
    setActiveModeState(mode)
  }

  const loginWithDev = async (accountType: ActiveMode) => {
    const r = await api.post<{ access_token: string; user: AuthUser }>('/auth/dev-login', {
      account_type: accountType,
    })
    localStorage.setItem('auth_token', r.data.access_token)
    setUser(r.data.user)
    localStorage.setItem('active_mode', accountType)
    setActiveModeState(accountType)
  }

  const sendSignupOtp = async (
    email: string,
    password: string,
    fullName: string,
    accountType: ActiveMode,
    company?: string | null,
    isThirdParty = false,
  ) => {
    await api.post('/auth/register/send-otp', {
      email,
      password,
      full_name: fullName,
      account_type: accountType,
      company: company ?? null,
      is_third_party_recruiter: isThirdParty,
    })
  }

  const verifySignupOtp = async (email: string, otpCode: string, accountType: ActiveMode) => {
    const r = await api.post<{ access_token: string; user: AuthUser }>('/auth/register/verify-otp', {
      email,
      otp_code: otpCode,
    })
    localStorage.setItem('auth_token', r.data.access_token)
    localStorage.setItem('active_mode', accountType)
    setUser(r.data.user)
    setActiveModeState(accountType)
  }

  const resendSignupOtp = async (email: string) => {
    await api.post('/auth/register/resend-otp', { email })
  }

  const loginWithLinkedIn = (accountType: ActiveMode | 'login') => {
    const base = (import.meta as any).env?.VITE_API_URL ?? ''
    window.location.href = `${base}/api/auth/linkedin/authorize?account_type=${accountType}`
  }

  const completeLinkedInLogin = async (token: string, accountType: ActiveMode) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('active_mode', accountType)
    const r = await api.get<AuthUser>('/auth/me')
    setUser(r.data)
    setActiveModeState(accountType)
  }

  const loginWithGoogle = (accountType: ActiveMode | 'login') => {
    const base = (import.meta as any).env?.VITE_API_URL ?? ''
    window.location.href = `${base}/api/auth/google/authorize?account_type=${accountType}`
  }

  // Identical post-OAuth handling to LinkedIn (store token, fetch user, set mode)
  const completeGoogleLogin = completeLinkedInLogin

  const refreshUser = async () => {
    const r = await api.get<AuthUser>('/auth/me')
    setUser(r.data)
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('active_mode')
    setUser(null)
    setActiveModeState(null)
  }

  const isRecruiter = activeMode === 'recruiter' && (user?.is_recruiter ?? false)
  const isCandidate = activeMode === 'candidate' && (user?.is_candidate ?? false)

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        activeMode,
        switchMode,
        addCapability,
        login,
        loginWithDev,
        sendSignupOtp,
        verifySignupOtp,
        resendSignupOtp,
        loginWithLinkedIn,
        completeLinkedInLogin,
        loginWithGoogle,
        completeGoogleLogin,
        logout,
        refreshUser,
        isAuthenticated: !!user,
        isRecruiter,
        isCandidate,
        isDualMode: (user?.is_recruiter ?? false) && (user?.is_candidate ?? false),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
