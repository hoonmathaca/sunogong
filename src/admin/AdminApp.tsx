import { useState } from 'react'
import { BrandFooter, Mascot } from '../components/Brand'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { isSupabaseConfigured } from '../lib/supabase'
import { AdminLogin } from './AdminLogin'
import { Dashboard } from './Dashboard'
import { RankingPanel } from './RankingPanel'
import { StudentsPanel } from './StudentsPanel'
import { useStudents } from './useStudents'

const STORAGE_KEY = 'sunogong.admin-signed-in'

type Tab = 'dashboard' | 'students' | 'ranking'

function readSignedIn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export interface AdminAppProps {
  onBack: () => void
}

/** 관리자 화면: 대시보드 · 학생 관리 · 랭킹 */
export function AdminApp({ onBack }: AdminAppProps): JSX.Element {
  const [signedIn, setSignedIn] = useState(readSignedIn)
  const [tab, setTab] = useState<Tab>('dashboard')
  const { students, loading, error, reload } = useStudents()

  const signIn = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* 저장 실패해도 이번 세션은 진행 */
    }
    setSignedIn(true)
  }

  const signOut = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* 무시 */
    }
    setSignedIn(false)
  }

  if (!signedIn) {
    return <AdminLogin onSuccess={signIn} onBack={onBack} />
  }

  return (
    <div className="screen bg-blue-soft/40">
      <header className="sticky top-0 z-30 border-b border-blue-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Mascot variant="face" className="h-10 w-10" />
          <div className="min-w-0 flex-1">
            <h1 className="font-round text-[20px] font-extrabold leading-none text-navy">선오공 관리자</h1>
            <p className="mt-1 text-[11px] font-semibold text-navy/45">훈수학학원 · 선생님 오늘도 공부했어요!</p>
          </div>
          <button type="button" className="btn-ghost border border-blue-line text-[12px]" onClick={onBack}>
            학생 화면
          </button>
          <button
            type="button"
            className="rounded-xl px-3 py-2 text-[12px] font-bold text-navy/50 hover:bg-blue-soft"
            onClick={signOut}
          >
            로그아웃
          </button>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 pb-2">
          {(
            [
              { key: 'dashboard', label: '대시보드' },
              { key: 'students', label: '학생 관리' },
              { key: 'ranking', label: '랭킹' },
            ] as { key: Tab; label: string }[]
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-[12px] font-bold transition ${
                tab === item.key ? 'bg-navy text-white shadow-soft' : 'text-navy/55 hover:bg-blue-soft'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-4">
        {!isSupabaseConfigured ? (
          <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
            Supabase 주소/키가 없어 데이터를 불러올 수 없어요. <code>.env</code> 의{' '}
            <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code> 를 채우고 다시 빌드해주세요.
          </div>
        ) : null}

        <ErrorBoundary>
          {tab === 'dashboard' ? (
            <Dashboard
              students={students}
              studentsLoading={loading}
              studentsError={error}
              reloadStudents={() => void reload()}
            />
          ) : null}
          {tab === 'students' ? (
            <StudentsPanel students={students} loading={loading} error={error} reload={() => void reload()} />
          ) : null}
          {tab === 'ranking' ? (
            <RankingPanel
              students={students}
              studentsLoading={loading}
              studentsError={error}
              reloadStudents={() => void reload()}
            />
          ) : null}
        </ErrorBoundary>
      </main>

      <BrandFooter />
    </div>
  )
}
