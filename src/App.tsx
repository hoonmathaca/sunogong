import { useMemo, type ReactNode } from 'react'
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom'
import { BrandFooter } from './components/Brand'
import { DesktopBlockScreen } from './components/DesktopBlockScreen'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AdminApp } from './admin/AdminApp'
import { StudentApp } from './student/StudentApp'
import { isStudentScreenBlocked, readDeviceFingerprint } from './lib/device'

function StudentRoute(): JSX.Element {
  const navigate = useNavigate()
  return <StudentApp onAdmin={() => navigate('/admin')} />
}

function AdminRoute(): JSX.Element {
  const navigate = useNavigate()
  return <AdminApp onBack={() => navigate('/')} />
}

function NotFound(): JSX.Element {
  return (
    <div className="screen items-center justify-center bg-white px-6 text-center">
      <p className="text-5xl font-extrabold text-navy/20">404</p>
      <p className="mt-3 text-lg font-bold text-navy">페이지를 찾을 수 없어요</p>
      <Link to="/" className="btn-navy mt-5">
        처음으로
      </Link>
      <BrandFooter />
    </div>
  )
}

/**
 * 학생용 화면은 스마트폰·태블릿에서만 연다.
 * 컴퓨터로 들어오면 안내 화면을 보여 주고, 관리자 화면(`/admin`)은 막지 않는다.
 */
function StudentOnly({ children }: { children: ReactNode }): JSX.Element {
  const blocked = useMemo(() => isStudentScreenBlocked(readDeviceFingerprint()), [])
  if (blocked) return <DesktopBlockScreen />
  return <>{children}</>
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route
            path="/"
            element={
              <StudentOnly>
                <StudentRoute />
              </StudentOnly>
            }
          />
          <Route path="/admin" element={<AdminRoute />} />
          <Route
            path="*"
            element={
              <StudentOnly>
                <NotFound />
              </StudentOnly>
            }
          />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
