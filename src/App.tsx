import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom'
import { BrandFooter } from './components/Brand'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AdminApp } from './admin/AdminApp'
import { StudentApp } from './student/StudentApp'

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

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<StudentRoute />} />
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
