import React, { createContext, useContext, useEffect, useState } from 'react'
import api from '../api/client'
import { AuthUser } from '../types'

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  activeRole: 'recruiter' | 'candidate' | null
  login: (email: string, password: string, role: 'recruiter' | 'candidate') => Promise<void>
  register: (
    email: string,
    password: string,
    fullName: string,
    role: 'recruiter' | 'candidate',
    company?: string | null,
    isThirdPartyRecruiter?: boolean,
  ) => Promise<void>
  /** Redirect the browser to the LinkedIn OAuth flow for the given role. */
  loginWithLinkedIn: (role: 'recruiter' | 'candidate') => void
  /** Complete a LinkedIn OAuth flow: store the token returned in the callback URL. */
  completeLinkedInLogin: (token: string, role: 'recruiter' | 'candidate') => Promise<void>
  logout: () => void
  /** Switch the active session to `role`. Returns false if no stored token exists for that role. */
  switchRole: (role: 'recruiter' | 'candidate') => Promise<boolean>
  /** True if a valid token is stored for the given role (even if it's not the active one). */
  hasLinkedRole: (role: 'recruiter' | 'candidate') => boolean
  /** Re-fetch /auth/me and update the user object in context. */
  refreshUser: () => Promise<void>
  isAuthenticated: boolean
  isRecruiter: boolean
  isCandidate: boolean
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [activeRole, setActiveRole] = useState<'recruiter' | 'candidate' | null>(null)
  const [loading, setLoading] = useState(true)

  // Restore session on mount; migrate legacy `auth_token` key if present
  useEffect(() => {
    const legacyToken = localStorage.getItem('auth_token')
    if (legacyToken && !localStorage.getItem('active_role')) {
      // Migrate: discover role from /auth/me then re-key
      api
        .get<AuthUser>('/auth/me', { headers: { Authorization: `Bearer ${legacyToken}` } })
        .then(r => {
          const role = r.data.role as 'recruiter' | 'candidate'
          localStorage.setItem(`auth_token_${role}`, legacyToken)
          localStorage.setItem('active_role', role)
          localStorage.removeItem('auth_token')
          setUser(r.data)
          setActiveRole(role)
        })
        .catch(() => localStorage.removeItem('auth_token'))
        .finally(() => setLoading(false))
      return
    }

    const role = localStorage.getItem('active_role') as 'recruiter' | 'candidate' | null
    const token = role ? localStorage.getItem(`auth_token_${role}`) : null
    if (token && role) {
      api
        .get<AuthUser>('/auth/me')
        .then(r => {
          setUser(r.data)
          setActiveRole(role)
        })
        .catch(() => {
          localStorage.removeItem(`auth_token_${role}`)
          localStorage.removeItem('active_role')
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email: string, password: string, role: 'recruiter' | 'candidate') => {
    const r = await api.post<{ access_token: string; user: AuthUser }>('/auth/login', {
      email,
      password,
      role,
    })
    localStorage.setItem(`auth_token_${role}`, r.data.access_token)
    localStorage.setItem('active_role', role)
    setUser(r.data.user)
    setActiveRole(role)
  }

  const register = async (
    email: string,
    password: string,
    fullName: string,
    role: 'recruiter' | 'candidate',
    company?: string | null,
    isThirdPartyRecruiter?: boolean,
  ) => {
    const r = await api.post<{ access_token: string; user: AuthUser }>('/auth/register', {
      email,
      password,
      full_name: fullName,
      role,
      company: company ?? null,
      is_third_party_recruiter: isThirdPartyRecruiter ?? false,
    })
    localStorage.setItem(`auth_token_${role}`, r.data.access_token)
    localStorage.setItem('active_role', role)
    setUser(r.data.user)
    setActiveRole(role)
  }

  const loginWithLinkedIn = (role: 'recruiter' | 'candidate') => {
    window.location.href = `/api/auth/linkedin/authorize?role=${role}`
  }

  const completeLinkedInLogin = async (token: string, role: 'recruiter' | 'candidate') => {
    localStorage.setItem(`auth_token_${role}`, token)
    localStorage.setItem('active_role', role)
    const r = await api.get<AuthUser>('/auth/me')
    setUser(r.data)
    setActiveRole(role)
  }

  const switchRole = async (role: 'recruiter' | 'candidate'): Promise<boolean> => {
    const token = localStorage.getItem(`auth_token_${role}`)
    if (!token) return false

    // Temporarily update active_role so the request interceptor picks up the right token
    const prevRole = localStorage.getItem('active_role')
    localStorage.setItem('active_role', role)
    try {
      const r = await api.get<AuthUser>('/auth/me')
      setUser(r.data)
      setActiveRole(role)
      return true
    } catch {
      // Token expired — clean up and restore previous active role
      localStorage.removeItem(`auth_token_${role}`)
      if (prevRole) localStorage.setItem('active_role', prevRole)
      else localStorage.removeItem('active_role')
      return false
    }
  }

  const hasLinkedRole = (role: 'recruiter' | 'candidate'): boolean =>
    !!localStorage.getItem(`auth_token_${role}`)

  const refreshUser = async () => {
    const r = await api.get<AuthUser>('/auth/me')
    setUser(r.data)
  }

  const logout = () => {
    if (activeRole) localStorage.removeItem(`auth_token_${activeRole}`)
    localStorage.removeItem('active_role')
    setUser(null)
    setActiveRole(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        activeRole,
        login,
        register,
        loginWithLinkedIn,
        completeLinkedInLogin,
        logout,
        switchRole,
        hasLinkedRole,
        refreshUser,
        isAuthenticated: !!user,
        isRecruiter: user?.role === 'recruiter',
        isCandidate: user?.role === 'candidate',
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
