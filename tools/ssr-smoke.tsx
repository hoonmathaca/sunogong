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
import { TimerScreen } from '../src/student/TimerScreen'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import type { FinishResult, Student, StudySession } from '../src/lib/types'

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

const runningSession = (kind: 'academy' | 'homework'): StudySession => ({
  ...result.session,
  id: 'run-' + kind,
  status: 'running',
  kind,
  ended_at: null,
  last_heartbeat_at: '2026-11-19T05:00:00Z',
  minutes: null,
  problems: null,
})

const cases: [string, () => JSX.Element][] = [
  [
    'TimerScreen(숙제)',
    () => (
      <TimerScreen
        student={student}
        initialSession={runningSession('homework')}
        onFinished={() => {}}
        onDiscarded={() => {}}
        onExit={() => {}}
      />
    ),
  ],
  [
    'TimerScreen(학원)',
    () => (
      <TimerScreen
        student={student}
        initialSession={runningSession('academy')}
        onFinished={() => {}}
        onDiscarded={() => {}}
        onExit={() => {}}
      />
    ),
  ],
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
const rendered: Record<string, string> = {}
for (const [name, render] of cases) {
  try {
    const html = renderToString(render())
    rendered[name] = html
    const hasText = html.replace(/<[^>]*>/g, '').trim().length > 0
    console.log(`ok   ${name.padEnd(22)} ${html.length} chars${hasText ? '' : '  (빈 화면!)'}`)
    if (!hasText) failed += 1
  } catch (error) {
    failed += 1
    console.log(`FAIL ${name}: ${error instanceof Error ? error.stack?.split('\n').slice(0, 3).join(' / ') : String(error)}`)
  }
}
/* 숙제/학원 타이머 안내 문구가 서로 다르게 나오는지 */
const homeworkHtml = rendered['TimerScreen(숙제)'] ?? ''
const academyHtml = rendered['TimerScreen(학원)'] ?? ''
const checks: [string, boolean][] = [
  ['숙제: 화면 끄면 멈춘다는 안내', homeworkHtml.includes('숙제 공부는 화면을 끄거나 나가면 멈춰요')],
  ['숙제: 화면보호 모드 버튼', homeworkHtml.includes('화면보호 모드')],
  ['숙제: 저조도 기본은 꺼짐(밝은 화면)', !homeworkHtml.includes('bg-[#07090F]')],
  ['학원: 화면 꺼져도 계속 간다는 안내', academyHtml.includes('학원 공부는 화면이 꺼져도 계속 가요')],
  ['학원: 화면보호 모드 버튼 없음', !academyHtml.includes('화면보호 모드')],
  ['숙제: 홈 안내 문구', (rendered['StudentHomeScreen'] ?? '').includes('숙제 공부는 화면을 끄거나 나가면 멈춰요')],
]
for (const [name, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
}

console.log(failed === 0 ? 'ALL SCREENS RENDERED' : `${failed} FAILED`)
