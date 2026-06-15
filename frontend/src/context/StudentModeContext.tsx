import { createContext, ReactNode, useContext, useState } from 'react'

interface StudentModeContextType {
  studentMode: boolean
  toggleStudentMode: () => void
}

const StudentModeContext = createContext<StudentModeContextType>({
  studentMode: false,
  toggleStudentMode: () => {},
})

export function StudentModeProvider({ children }: { children: ReactNode }) {
  const [studentMode, setStudentMode] = useState(() => {
    return localStorage.getItem('talentai_studentMode') === 'true'
  })

  const toggleStudentMode = () => {
    setStudentMode(prev => {
      const next = !prev
      localStorage.setItem('talentai_studentMode', String(next))
      return next
    })
  }

  return (
    <StudentModeContext.Provider value={{ studentMode, toggleStudentMode }}>
      {children}
    </StudentModeContext.Provider>
  )
}

export const useStudentMode = () => useContext(StudentModeContext)
