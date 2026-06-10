import React, { createContext, useContext, useEffect, useState } from 'react'
import api from '../api/client'
import { AuthUser } from '../types'

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (
    email: string,
    password: string,
    fullName: string,
    role: 'recruiter' | 'candidate',
  ) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
  isRecruiter: boolean
  isCandidate: boolean
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      api
        .get<AuthUser>('/auth/me')
        .then(r => setUser(r.data))
        .catch(() => localStorage.removeItem('auth_token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email: string, password: string) => {
    const r = await api.post<{ access_token: string; user: AuthUser }>('/auth/login', {
      email,
      password,
    })
    localStorage.setItem('auth_token', r.data.access_token)
    setUser(r.data.user)
  }

  const register = async (
    email: string,
    password: string,
    fullName: string,
    role: 'recruiter' | 'candidate',
  ) => {
    const r = await api.post<{ access_token: string; user: AuthUser }>('/auth/register', {
      email,
      password,
      full_name: fullName,
      role,
    })
    localStorage.setItem('auth_token', r.data.access_token)
    setUser(r.data.user)
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
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
