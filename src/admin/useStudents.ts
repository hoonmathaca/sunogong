import { useCallback, useEffect, useState } from 'react'
import * as api from '../lib/api'
import type { Student } from '../lib/types'

export interface StudentsState {
  students: Student[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

export function useStudents(): StudentsState {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const res = await api.listStudents()
    if (res.ok) {
      setStudents(res.data)
      setError(null)
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { students, loading, error, reload }
}
