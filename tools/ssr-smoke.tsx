/**
 * 화면이 실제로 그려지는지 확인하는 스모크 테스트 (개발용).
 *   npx vite build --ssr tools/ssr-smoke.tsx --outDir /tmp/ssr-smoke && node /tmp/ssr-smoke/ssr-smoke.js
 * 서버 없이 첫 렌더만 확인합니다(데이터 요청은 useEffect 라서 실행되지 않음).
 */
import { renderToString } from 'react-dom/server'
import { AdminLogin } from '../src/admin/AdminLogin'
import { AdminApp } from '../src/admin/AdminApp'
import { Dashboard } from '../src/admin/Dashboard'
import { RankingPanel } from '../src/admin/RankingPanel'
import { StudentsPanel } from '../src/admin/StudentsPanel'
import { CodeEntryScreen } from '../src/student/CodeEntryScreen'
import { ChooseStudentScreen } from '../src/student/ChooseStudentScreen'
import { StudentHomeScreen } from '../src/student/StudentHomeScreen'
import { ResultScreen } from '../src/student/ResultScreen'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import type { FinishResult, Student } from '../src/lib/types'

const student: Student = {
  id: '006f733f-98c3-45d0-a152-3518f1fff1b7',
  name: '이지빈',
  code: '3733',
  grade: '초1',
  created_at: '2026-11-19T00:00:00Z',
}

const result: FinishResult = {
  session: {
    id: 's1',
    student_id: student.id,
    status: 'finished',
    started_at: '2026-11-19T04:00:00Z',
    paused_at: null,
    ended_at: '2026-11-19T05:00:00Z',
    last_heartbeat_at: '2026-11-19T05:00:00Z',
    paused_seconds: 0,
    auto_pause_count: 0,
    auto_paused_seconds: 0,
    date: '2026-11-19',
    minutes: 60,
    problems: 12,
    created_at: '2026-11-19T04:00:00Z',
  },
  log: null,
  seconds: 3600,
  minutes: 60,
  problems: 12,
  total_minutes: 120,
  total_problems: 22,
  date: '2026-11-19',
}

const cases: [string, () => JSX.Element][] = [
  ['CodeEntryScreen', () => <CodeEntryScreen onSubmit={async () => ({ ok: true })} onAdmin={() => {}} />],
  [
    'ChooseStudentScreen',
    () => (
      <ChooseStudentScreen code="0213" candidates={[student, { ...student, id: 'x', name: '서루빈' }]} busy={false} onSelect={() => {}} onBack={() => {}} />
    ),
  ],
  ['StudentHomeScreen', () => <StudentHomeScreen student={student} onStart={() => {}} onExit={() => {}} />],
  ['ResultScreen', () => <ResultScreen student={student} result={result} reason="manual" onHome={() => {}} onAgain={() => {}} />],
  ['AdminLogin', () => <AdminLogin onSuccess={() => {}} onBack={() => {}} />],
  ['AdminApp', () => <AdminApp onBack={() => {}} />],
  ['Dashboard', () => <Dashboard students={[student]} studentsLoading={false} studentsError={null} reloadStudents={() => {}} />],
  ['StudentsPanel', () => <StudentsPanel students={[student]} loading={false} error={null} reload={() => {}} />],
  ['RankingPanel', () => <RankingPanel students={[student]} studentsLoading={false} studentsError={null} reloadStudents={() => {}} />],
  ['ErrorBoundary(자식)', () => <ErrorBoundary><CodeEntryScreen onSubmit={async () => ({ ok: true })} onAdmin={() => {}} /></ErrorBoundary>],
]

let failed = 0
for (const [name, render] of cases) {
  try {
    const html = renderToString(render())
    const hasText = html.replace(/<[^>]*>/g, '').trim().length > 0
    console.log(`ok   ${name.padEnd(22)} ${html.length} chars${hasText ? '' : '  (빈 화면!)'}`)
    if (!hasText) failed += 1
  } catch (error) {
    failed += 1
    console.log(`FAIL ${name}: ${error instanceof Error ? error.stack?.split('\n').slice(0, 3).join(' / ') : String(error)}`)
  }
}
console.log(failed === 0 ? 'ALL SCREENS RENDERED' : `${failed} FAILED`)
