/**
 * 화면이 실제로 그려지는지 확인하는 스모크 테스트 (개발용).
 *   npx vite build --ssr tools/ssr-smoke.tsx --outDir /tmp/ssr-smoke && node /tmp/ssr-smoke/ssr-smoke.js
 * 서버 없이 첫 렌더만 확인합니다(데이터 요청은 useEffect 라서 실행되지 않음).
 */
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AdminLogin } from '../src/admin/AdminLogin'
import { AdminApp } from '../src/admin/AdminApp'
import { Dashboard } from '../src/admin/Dashboard'
import { QuestionsPanel } from '../src/admin/QuestionsPanel'
import { PushNotifyPanel } from '../src/admin/PushNotifyPanel'
import { RankingPanel } from '../src/admin/RankingPanel'
import { StudentsPanel } from '../src/admin/StudentsPanel'
import { CodeEntryScreen } from '../src/student/CodeEntryScreen'
import { ChooseStudentScreen } from '../src/student/ChooseStudentScreen'
import { QuestionAskForm } from '../src/student/QuestionAskForm'
import { QuestionBoardScreen } from '../src/student/QuestionBoardScreen'
import { StudentHomeScreen } from '../src/student/StudentHomeScreen'
import { ResultScreen } from '../src/student/ResultScreen'
import { TimerScreen } from '../src/student/TimerScreen'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { DesktopBlockScreen } from '../src/components/DesktopBlockScreen'
import type { FinishResult, Student, StudySession } from '../src/lib/types'

/* 서버에는 localStorage 가 없어서, 관리자 화면(로그인 유지) 스모크용으로 최소 저장소를 흉내 낸다 */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>([['sunogong.admin-signed-in', '1']])
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}

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
  ['StudentHomeScreen', () => <StudentHomeScreen student={student} onStart={() => {}} onExit={() => {}} onQuestions={() => {}} unreadAnswers={2} />],
  ['QuestionBoardScreen', () => <QuestionBoardScreen student={student} onBack={() => {}} />],
  ['QuestionAskForm', () => <QuestionAskForm studentId={student.id} />],
  ['QuestionsPanel(관리자 질문함)', () => <QuestionsPanel />],
  ['PushNotifyPanel(새 질문 알림)', () => <PushNotifyPanel />],
  ['ResultScreen', () => <ResultScreen student={student} result={result} reason="manual" onHome={() => {}} onAgain={() => {}} />],
  ['AdminLogin', () => <AdminLogin onSuccess={() => {}} onBack={() => {}} />],
  ['AdminApp', () => <AdminApp onBack={() => {}} />],
  ['Dashboard', () => <Dashboard students={[student]} studentsLoading={false} studentsError={null} reloadStudents={() => {}} />],
  ['StudentsPanel', () => <StudentsPanel students={[student]} loading={false} error={null} reload={() => {}} />],
  ['RankingPanel', () => <RankingPanel students={[student]} studentsLoading={false} studentsError={null} reloadStudents={() => {}} />],
  ['ErrorBoundary(자식)', () => <ErrorBoundary><CodeEntryScreen onSubmit={async () => ({ ok: true })} onAdmin={() => {}} /></ErrorBoundary>],
  [
    'DesktopBlockScreen(PC 안내)',
    () => (
      <MemoryRouter>
        <DesktopBlockScreen />
      </MemoryRouter>
    ),
  ],
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
  ['숙제: 전체화면 버튼', homeworkHtml.includes('⛶ 전체화면')],
  ['학원: 전체화면 버튼', academyHtml.includes('⛶ 전체화면')],
  ['기본 화면에는 전체화면 안내 없음', !homeworkHtml.includes('홈 화면에 추가')],
  ['숙제: 저조도 기본은 꺼짐(밝은 화면)', !homeworkHtml.includes('bg-[#07090F]')],
  ['학원: 화면 꺼져도 계속 간다는 안내', academyHtml.includes('학원 공부는 화면이 꺼져도 계속 가요')],
  ['학원: 화면보호 모드 버튼 없음', !academyHtml.includes('화면보호 모드')],
  ['숙제: 홈 안내 문구', (rendered['StudentHomeScreen'] ?? '').includes('숙제 공부는 화면을 끄거나 나가면 멈춰요')],
  ['PC 안내: 스마트폰·태블릿에서만 안내', (rendered['DesktopBlockScreen(PC 안내)'] ?? '').includes('스마트폰 또는 태블릿에서만')],
  ['PC 안내: 관리자 페이지 링크', (rendered['DesktopBlockScreen(PC 안내)'] ?? '').includes('href="/admin"')],
]

/* '선오공에게 질문하기' Q&A 화면 */
const homeHtml = rendered['StudentHomeScreen'] ?? ''
const questionHtml = rendered['QuestionBoardScreen'] ?? ''
const askHtml = rendered['QuestionAskForm'] ?? ''
const questionsPanelHtml = rendered['QuestionsPanel(관리자 질문함)'] ?? ''
const adminHtml = rendered['AdminApp'] ?? ''
const questionChecks: [string, boolean][] = [
  ['질문: 홈에 진입 버튼', homeHtml.includes('선오공에게 질문하기')],
  ['질문: 홈에 새 답변 배지', homeHtml.includes('새 답변')],
  ['질문: 타이머에도 질문 버튼', homeworkHtml.includes('선오공에게 질문하기')],
  ['질문: 타이머는 계속 간다는 안내', homeworkHtml.includes('타이머는 계속 가요')],
  ['질문: 학생 화면 제목', questionHtml.includes('선오공에게 질문하기')],
  ['질문: 학생 화면 질문 올리기', questionHtml.includes('질문 올리기')],
  ['질문: 사진 찍기·앨범 버튼', askHtml.includes('사진 찍기') && askHtml.includes('앨범에서')],
  ['질문: 관리자 질문함 제목', questionsPanelHtml.includes('선오공에게 온 질문')],
  ['질문: 관리자 필터(답변 대기)', questionsPanelHtml.includes('답변 대기')],
  ['질문: 관리자 자동 정리 안내', questionsPanelHtml.includes('오래된 질문 자동 정리')],
  ['질문: 관리자 7일 보관 안내', questionsPanelHtml.includes('7일')],
  ['질문: 관리자 질문함 탭', adminHtml.includes('질문함')],
  ['알림: 관리자 질문함에 알림 설정', questionsPanelHtml.includes('새 질문 알림')],
  ['알림: 알림 켜기 버튼', (rendered['PushNotifyPanel(새 질문 알림)'] ?? '').includes('알림 켜기')],
  ['알림: 테스트 알림 버튼', (rendered['PushNotifyPanel(새 질문 알림)'] ?? '').includes('테스트 알림 보내기')],
  ['조사: "선오공이에게" 표기 없음', ![homeHtml, homeworkHtml, academyHtml, questionHtml, askHtml, questionsPanelHtml, adminHtml].join('').includes('선오공이에게')],
]
for (const [name, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
}
for (const [name, ok] of questionChecks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
}

console.log(failed === 0 ? 'ALL SCREENS RENDERED' : `${failed} FAILED`)
