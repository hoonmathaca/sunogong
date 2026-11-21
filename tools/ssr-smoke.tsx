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
import { KintounPanel } from '../src/admin/KintounPanel'
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
import { LiveKintounStrip } from '../src/student/LiveKintounStrip'
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
  nickname: '달토끼',
  dragonball_count: 7,
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
  [
    'LiveKintounStrip(세션 있음)',
    () => <LiveKintounStrip studentId={student.id} sessionId="run-homework" sessionStatus="running" />,
  ],
  ['QuestionsPanel(관리자 질문함)', () => <QuestionsPanel />],
  ['PushNotifyPanel(새 질문 알림)', () => <PushNotifyPanel />],
  ['ResultScreen', () => <ResultScreen student={student} result={result} reason="manual" onHome={() => {}} onAgain={() => {}} />],
  ['KintounPanel(관리자 근두운)', () => <KintounPanel students={[student]} studentsLoading={false} studentsError={null} reloadStudents={() => {}} />],
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
  ['스와이프: 관리자 화면에 좌우 스와이프 탭 이동', adminHtml.includes('data-admin-swipe="tab"')],
  ['스와이프: 관리자 탭 다섯 개', ['대시보드', '실시간', '질문함', '학생 관리', '랭킹'].every((label) => adminHtml.includes(`>${label}<`) || adminHtml.includes(label))],
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

/* 근두운 · 드래곤볼 */
const kintounPanelHtml = rendered['KintounPanel(관리자 근두운)'] ?? ''
const kintounChecks: [string, boolean][] = [
  ['근두운: 홈에 근두운 카드', homeHtml.includes('근두운')],
  ['근두운: 홈에 내 드래곤볼', homeHtml.includes('내 드래곤볼')],
  ['근두운: 홈에 실시간 순위', homeHtml.includes('실시간 연속 공부 순위')],
  ['근두운: 홈에 닉네임 바꾸기', homeHtml.includes('근두운에 보이는 내 이름')],
  ['실시간: 관리자 탭 이름', adminHtml.includes('>실시간<') && !adminHtml.includes('>근두운<')],
  ['근두운: 관리자 드래곤볼 쏘기', kintounPanelHtml.includes('선오공이 드래곤볼 쏘기')],
  ['근두운: 관리자 전체 쏘기 버튼', kintounPanelHtml.includes('명에게 쏘기')],
  ['근두운: 관리자 쉬는 중 포함', kintounPanelHtml.includes('쉬는 중인 학생도 포함')],
  ['근두운: 관리자 지급 이력', kintounPanelHtml.includes('드래곤볼 지급 이력')],
  ['근두운: 관리자 공부 중 목록', kintounPanelHtml.includes('지금 공부 중인 학생')],
  ['성구: 홈에 1~7성구 도감', homeHtml.includes('1~7성구 도감')],
  ['성구: 홈에 수집 현황(0/7종)', homeHtml.includes('0/7종 수집')],
  ['성구: 홈에 도감 일곱 칸', ['1성', '2성', '3성', '4성', '5성', '6성', '7성'].every((label) => homeHtml.includes(`>${label}<`))],
  ['성구: 관리자 랜덤 지급 안내', kintounPanelHtml.includes('1성구~7성구')],
  ['근두운: 숙제 타이머에 근두운 줄', homeworkHtml.includes('aria-label="근두운 — 지금 공부 중인 친구"')],
  ['근두운: 학원 타이머에는 없음', !academyHtml.includes('aria-label="근두운 — 지금 공부 중인 친구"')],
  ['근두운: 세션 id 넘기면 바로 읽을 준비', (rendered['LiveKintounStrip(세션 있음)'] ?? '').includes('불러오는 중')],
]

/* 학생 관리 — 닉네임 표시·수정 */
const studentsPanelHtml = rendered['StudentsPanel'] ?? ''
const nicknameChecks: [string, boolean][] = [
  ['닉네임: 학생 관리에 닉네임 열', studentsPanelHtml.includes('닉네임')],
  ['닉네임: 학생 관리에 닉네임 표시', studentsPanelHtml.includes('달토끼')],
  ['닉네임: 학생 관리에 바꾸기 버튼', studentsPanelHtml.includes('바꾸기')],
  ['닉네임: 학생 관리에 비우기 안내', studentsPanelHtml.includes('비우면 수련생') || studentsPanelHtml.includes('닉네임은 근두운')],
]
for (const [name, ok] of nicknameChecks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
}
for (const [name, ok] of kintounChecks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
}

console.log(failed === 0 ? 'ALL SCREENS RENDERED' : `${failed} FAILED`)
