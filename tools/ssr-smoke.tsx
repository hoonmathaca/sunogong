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
import { LiveSessionRow } from '../src/admin/LiveSessionRow'
import { EndStudyModal } from '../src/admin/EndStudyModal'
import type { AdminLiveSession } from '../src/lib/kintoun'
import { QuestionsPanel } from '../src/admin/QuestionsPanel'
import { PushNotifyPanel } from '../src/admin/PushNotifyPanel'
import { RankingPanel } from '../src/admin/RankingPanel'
import { StudentsPanel } from '../src/admin/StudentsPanel'
import { CodeEntryScreen } from '../src/student/CodeEntryScreen'
import { ChooseStudentScreen } from '../src/student/ChooseStudentScreen'
import { HomeworkPhotoPicker } from '../src/student/HomeworkPhotoPicker'
import { QuestionAskForm } from '../src/student/QuestionAskForm'
import { QuestionBoardScreen } from '../src/student/QuestionBoardScreen'
import { StudentHomeScreen } from '../src/student/StudentHomeScreen'
import { ResultScreen } from '../src/student/ResultScreen'
import { LiveKintounStrip } from '../src/student/LiveKintounStrip'
import { CandyPickModal } from '../src/student/CandyPickModal'
import { PendingProblemsModal } from '../src/student/PendingProblemsModal'
import { EditAcademyProblemsModal } from '../src/student/EditAcademyProblemsModal'
import { TimerScreen } from '../src/student/TimerScreen'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { PhotoPager } from '../src/components/PhotoPager'
import { HomeworkPanel } from '../src/admin/HomeworkPanel'
import { PraiseEditor } from '../src/admin/PraiseEditor'
import { HomeworkSubmissionRow } from '../src/student/HomeworkSubmissionRow'
import { DesktopBlockScreen } from '../src/components/DesktopBlockScreen'
import type { FinishResult, HomeworkSubmission, Student, StudySession } from '../src/lib/types'
import { QUOTES } from '../src/lib/quotes'

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

/* 쉬는 중(일시정지) 세션 — 30분 알림·60분 자동 종료 화면 확인용 */
const pausedSession: StudySession = {
  ...runningSession('homework'),
  id: 'paused-homework',
  status: 'paused',
  paused_at: '2026-11-19T05:00:00Z',
  last_heartbeat_at: '2026-11-19T05:00:00Z',
}

/* 관리자 실시간 탭의 활성 세션 한 줄 — 「수업 종료」 버튼 확인용 */
const liveRow: AdminLiveSession = {
  sessionId: 'live-1',
  studentId: student.id,
  name: '김민수',
  grade: '중2',
  nickname: '열공몬',
  displayName: '열공몬',
  dragonballs: { '1': 1, '2': 0, '3': 1, '4': 0, '5': 0, '6': 0, '7': 0 },
  dragons: { red: 1, orange: 0, yellow: 0, green: 0, blue: 0, navy: 0, purple: 0 },
  rainbowDragonCount: 0,
  status: 'running',
  kind: 'academy',
  startedAt: '2026-11-23T05:00:00Z',
  seconds: 1531,
  dragonballCount: 2,
}

/* 자동 종료된 지난 공부 (문제 수 미입력) */
const pendingSession: StudySession = {
  ...pausedSession,
  id: 'pending-1',
  status: 'finished',
  kind: 'homework',
  date: '2026-11-21',
  paused_at: null,
  ended_at: '2026-11-21T10:00:00Z',
  minutes: 80,
  problems: null,
  problems_pending: true,
  auto_ended: true,
}

/* 자동 종료되어 문제 수를 아직 받지 못한 숙제 제출 (다음 접속 때 사진+문제 수) */
const pendingHomework: HomeworkSubmission = {
  id: 'hw-pending-1',
  student_id: student.id,
  session_id: 'pending-1',
  date: '2026-11-21',
  started_at: '2026-11-21T08:40:00Z',
  ended_at: '2026-11-21T10:00:00Z',
  submitted_minutes: 80,
  submitted_problems: null,
  photo_paths: [],
  status: 'pending',
  time_verdict: 'pending',
  problems_verdict: 'pending',
  approved_minutes: 0,
  approved_problems: 0,
  reject_reason: null,
  teacher_comment: null,
  submitted_at: '2026-11-21T10:00:00Z',
  reviewed_at: null,
  reviewed_by: null,
  created_at: '2026-11-21T10:00:00Z',
  updated_at: '2026-11-21T10:00:00Z',
}

/* 숙제 승인 결과 화면 */
const homeworkResult: FinishResult = {
  ...result,
  kind: 'homework',
  pending_approval: true,
  submission_id: 'hw-1',
  submitted_minutes: 60,
  submitted_problems: 12,
}

const todayAcademyResult: FinishResult = {
  ...result,
  kind: 'academy',
  log: {
    id: 'l1',
    student_id: student.id,
    date: '2026-11-19',
    minutes: 80,
    problems: 17,
    academy_minutes: 60,
    academy_problems: 12,
    homework_minutes: 20,
    homework_problems: 5,
    updated_at: '2026-11-19T05:00:00Z',
  },
  total_minutes: 80,
  total_problems: 17,
}

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
    'TimerScreen(쉬는 중)',
    () => (
      <TimerScreen
        student={student}
        initialSession={pausedSession}
        onFinished={() => {}}
        onDiscarded={() => {}}
        onAutoEnded={() => {}}
        onExit={() => {}}
      />
    ),
  ],
  [
    'PendingProblemsModal(지난 공부 문제 수)',
    () => (
      <PendingProblemsModal
        studentId={student.id}
        item={{ type: 'academy', id: pendingSession.id, session: { ...pendingSession, kind: 'academy' } }}
        onSubmit={() => {}}
        onSkip={() => {}}
      />
    ),
  ],
  [
    'PendingProblemsModal(지난 숙제 제출)',
    () => (
      <PendingProblemsModal
        studentId={student.id}
        item={{ type: 'homework', id: pendingHomework.id, submission: pendingHomework }}
        onSubmit={() => {}}
        onSkip={() => {}}
      />
    ),
  ],
  [
    'HomeworkPhotoPicker(사진 없음)',
    () => <HomeworkPhotoPicker photos={[]} onAdd={() => {}} onRemove={() => {}} />,
  ],
  [
    'HomeworkPhotoPicker(사진 두 장)',
    () => (
      <HomeworkPhotoPicker
        photos={[
          { key: 'a', name: 'a.jpg', blob: null, path: 's/1', preview: 'data:,', state: 'ready' },
          { key: 'b', name: 'b.jpg', blob: null, path: 's/2', preview: 'data:,', state: 'ready' },
        ]}
        onAdd={() => {}}
        onRemove={() => {}}
      />
    ),
  ],
  [
    'HomeworkPhotoPicker(올리는 중·올라감)',
    () => (
      <HomeworkPhotoPicker
        photos={[
          { key: 'a', name: 'a.jpg', blob: null, path: null, preview: 'data:,', state: 'uploading' },
          { key: 'b', name: 'b.jpg', blob: null, path: 's/1', preview: 'data:,', state: 'ready' },
          { key: 'c', name: 'c.jpg', blob: null, path: null, preview: 'data:,', state: 'error', error: '사진을 올리지 못했어요.' },
        ]}
        onAdd={() => {}}
        onRemove={() => {}}
      />
    ),
  ],
  [
    'PhotoPager(사진 2장)',
    () => <PhotoPager urls={['a', 'b']} index={0} onIndexChange={() => {}} onClose={() => {}} />,
  ],
  ['HomeworkPanel(관리자 숙제관리)', () => <HomeworkPanel />],
  ['PraiseEditor(선생님 칭찬 한마디)', () => <PraiseEditor value="" onChange={() => {}} />],
  ['PraiseEditor(모두 반려)', () => <PraiseEditor value="" onChange={() => {}} approved={false} />],
  [
    'HomeworkSubmissionRow(선생님 한마디)',
    () => (
      <ul>
        <HomeworkSubmissionRow
          submission={{
            ...pendingHomework,
            id: 'hw-comment-1',
            status: 'approved',
            time_verdict: 'approved',
            problems_verdict: 'approved',
            approved_minutes: 80,
            approved_problems: 12,
            submitted_problems: 12,
            teacher_comment: '풀이가 꼼꼼해요',
          }}
        />
      </ul>
    ),
  ],
  [
    'HomeworkSubmissionRow(반려)',
    () => (
      <ul>
        <HomeworkSubmissionRow
          submission={{
            ...pendingHomework,
            id: 'hw-rejected-1',
            status: 'rejected',
            time_verdict: 'rejected',
            problems_verdict: 'rejected',
            submitted_problems: 5,
            reject_reason: '풀이 흔적 부족',
          }}
        />
      </ul>
    ),
  ],
  [
    'ResultScreen(숙제 승인 대기)',
    () => <ResultScreen student={student} result={homeworkResult} reason="manual" onHome={() => {}} onAgain={() => {}} />,
  ],
  [
    'ChooseStudentScreen',
    () => (
      <ChooseStudentScreen code="0213" candidates={[student, { ...student, id: 'x', name: '서루빈' }]} busy={false} onSelect={() => {}} onBack={() => {}} />
    ),
  ],
  ['StudentHomeScreen', () => <StudentHomeScreen student={student} onStart={() => {}} onExit={() => {}} onQuestions={() => {}} unreadAnswers={2} />],
  [
    'StudentHomeScreen(지난 공부 문제 수 있음)',
    () => (
      <StudentHomeScreen
        student={student}
        onStart={() => {}}
        onExit={() => {}}
        onQuestions={() => {}}
        unreadAnswers={0}
        pendingProblems={2}
        onPendingProblems={() => {}}
      />
    ),
  ],
  ['QuestionBoardScreen', () => <QuestionBoardScreen student={student} onBack={() => {}} />],
  ['QuestionAskForm', () => <QuestionAskForm studentId={student.id} />],
  [
    'LiveKintounStrip(세션 있음)',
    () => <LiveKintounStrip studentId={student.id} sessionId="run-homework" sessionStatus="running" />,
  ],
  [
    'CandyPickModal(성구 2개 고름)',
    () => (
      <CandyPickModal
        open
        rawStars={{ '1': 1, '2': 0, '3': 2, '4': 0, '5': 3, '6': 0, '7': 0 }}
        selected={[3, 5]}
        onPick={() => {}}
        onUnpick={() => {}}
        onClear={() => {}}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    ),
  ],
  [
    'CandyPickModal(성구 1개만 고름)',
    () => (
      <CandyPickModal
        open
        rawStars={{ '1': 1, '2': 0, '3': 2, '4': 0, '5': 3, '6': 0, '7': 0 }}
        selected={[3]}
        onPick={() => {}}
        onUnpick={() => {}}
        onClear={() => {}}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    ),
  ],
  ['QuestionsPanel(관리자 질문함)', () => <QuestionsPanel />],
  ['PushNotifyPanel(새 질문 알림)', () => <PushNotifyPanel />],
  ['ResultScreen', () => <ResultScreen student={student} result={result} reason="manual" onHome={() => {}} onAgain={() => {}} />],
  [
    'ResultScreen(학원 — 오늘 기록 있음)',
    () => <ResultScreen student={student} result={todayAcademyResult} reason="manual" onHome={() => {}} onAgain={() => {}} />,
  ],
  [
    'EditAcademyProblemsModal(오늘 학원 문제 수)',
    () => (
      <EditAcademyProblemsModal
        open
        studentId={student.id}
        current={12}
        onClose={() => {}}
        onSaved={() => {}}
      />
    ),
  ],
  ['KintounPanel(관리자 근두운)', () => <KintounPanel students={[student]} studentsLoading={false} studentsError={null} reloadStudents={() => {}} />],
  [
    'LiveSessionRow(수업 종료 버튼)',
    () => (
      <ul>
        <LiveSessionRow row={liveRow} amount={3} onGrant={() => {}} onEnd={() => {}} />
      </ul>
    ),
  ],
  [
    'EndStudyModal(수업 종료 확인)',
    () => (
      <EndStudyModal
        open
        row={liveRow}
        problems="7"
        onProblemsChange={() => {}}
        busy={false}
        error={null}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    ),
  ],
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
  ['스와이프: 관리자 탭 여섯 개', ['대시보드', '실시간', '숙제관리', '질문함', '학생 관리', '랭킹'].every((label) => adminHtml.includes(`>${label}<`) || adminHtml.includes(label))],
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

/* 「오늘의 한줄」 — 코드 입력 화면 아래에 명언 카드가 한 줄로 나오는지 */
const entryHtml = rendered['CodeEntryScreen'] ?? ''
const shownQuote = QUOTES.find((q) => entryHtml.includes(q.text))
const quoteChecks: [string, boolean][] = [
  ['한줄: 로그인 화면에 오늘의 한줄 카드', entryHtml.includes('오늘의 한줄')],
  ['한줄: 예전 이름(오늘의 명언)은 없음', !entryHtml.includes('오늘의 명언')],
  ['한줄: 누르면 바뀐다는 안내 없음', !entryHtml.includes('눌러서 바꾸기') && !entryHtml.includes('누르면 다른')],
  ['한줄: 124개 중 한 개의 문구가 실제로 나옴', Boolean(shownQuote)],
  ['한줄: 그 명언의 출처도 함께 나옴', Boolean(shownQuote) && entryHtml.includes(shownQuote!.source)],
  ['한줄: 카드는 누를 수 없는 일반 카드(버튼 아님)', entryHtml.includes('data-quote-card') && !/<button[^>]*data-quote-card/.test(entryHtml) && !/data-quote-card[^>]*<button/.test(entryHtml)],
  ['한줄: 화면에는 한 번에 한 개만', QUOTES.filter((q) => entryHtml.includes(q.text)).length === 1],
]
for (const [name, ok] of quoteChecks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
}

/* 근두운 · 드래곤볼 */
const kintounPanelHtml = rendered['KintounPanel(관리자 근두운)'] ?? ''
const candyReadyHtml = rendered['CandyPickModal(성구 2개 고름)'] ?? ''
const candyOneHtml = rendered['CandyPickModal(성구 1개만 고름)'] ?? ''
const kintounChecks: [string, boolean][] = [
  ['근두운: 홈에 근두운 카드', homeHtml.includes('근두운')],
  ['근두운: 홈에 내 드래곤볼', homeHtml.includes('내 드래곤볼')],
  ['근두운: 홈에 실시간 순위', homeHtml.includes('실시간 연속 공부 순위')],
  ['근두운: 홈에 닉네임 바꾸기', homeHtml.includes('근두운에 보이는 내 이름')],
  ['실시간: 관리자 탭 이름', adminHtml.includes('>실시간<') && !adminHtml.includes('>근두운<')],
  ['근두운: 관리자 지금 공부 중 학원·숙제 따로', kintounPanelHtml.includes('🏫 학원 0명 · 🏠 숙제 0명')],
  ['근두운: 관리자 드래곤볼 쏘기', kintounPanelHtml.includes('선오공이 드래곤볼 쏘기')],
  ['근두운: 관리자 전체 쏘기 버튼', kintounPanelHtml.includes('명에게 쏘기')],
  ['근두운: 관리자 쉬는 중 포함', kintounPanelHtml.includes('쉬는 중인 학생도 포함')],
  ['근두운: 관리자 지급 이력', kintounPanelHtml.includes('드래곤볼 지급 이력')],
  ['근두운: 관리자 공부 중 목록', kintounPanelHtml.includes('지금 공부 중인 학생')],
  ['성구: 홈에 1~7성구 도감', homeHtml.includes('1~7성구 도감')],
  ['성구: 홈에 수집 현황(0/7종)', homeHtml.includes('0/7종 수집')],
  ['성구: 홈에 도감 일곱 칸', ['1성', '2성', '3성', '4성', '5성', '6성', '7성'].every((label) => homeHtml.includes(`>${label}<`))],
  ['성구: 관리자 랜덤 지급 안내', kintounPanelHtml.includes('1성구~7성구')],
  ['일반용: 홈에 일반용 뽑기 버튼', homeHtml.includes('일반용 뽑기')],
  ['일반용: 홈에 부족한 성구 안내', homeHtml.includes('만 더 모으면 일반용을 뽑아요')],
  ['무지개용: 홈에 무지개용 합성 버튼', homeHtml.includes('무지개용') && homeHtml.includes('일반용 7종 하나씩')],
  ['무지개 볼 표현 없음', !homeHtml.includes('무지개 볼') && !kintounPanelHtml.includes('무지개 볼')],
  ['교환권: 홈에 사탕교환권 버튼', homeHtml.includes('사탕교환권') && homeHtml.includes('성구 2개 → 1장')],
  ['교환권: 홈에 포인트 교환권 버튼', homeHtml.includes('1,000P 교환권') && homeHtml.includes('10,000P')],
  ['사탕고르기: 창 제목·안내', candyReadyHtml.includes('사탕교환권으로 바꾸기') && candyReadyHtml.includes('쓸 <b>성구 2개</b>')],
  ['사탕고르기: 고른 성구 두 칸', candyReadyHtml.includes('3성구') && candyReadyHtml.includes('5성구') && candyReadyHtml.includes('2개를 다 골랐어요')],
  ['사탕고르기: 두 개 고르면 바꾸기 버튼 열림', !/<button[^>]*disabled=""[^>]*>사탕교환권으로 바꾸기/.test(candyReadyHtml)],
  ['사탕고르기: 하나만 고르면 안내·버튼 잠김', candyOneHtml.includes('1개 더 고르세요') && /<button[^>]*disabled=""[^>]*>사탕교환권으로 바꾸기/.test(candyOneHtml)],
  ['사탕고르기: 일곱 성구 칸 모두', ['1성', '2성', '3성', '4성', '5성', '6성', '7성'].every((label) => candyReadyHtml.includes(`>${label}<`))],
  ['사탕고르기: 고른 칸은 개수 표시', candyReadyHtml.includes('1개 고름')],
  ['사탕고르기: 없는 성구는 고를 수 없음(–)', candyReadyHtml.includes('aria-label="2성구 고르기 (0개 남음)"')],
  ['교환권: 관리자 사용 처리 칸', kintounPanelHtml.includes('교환권 지급 확인 · 사용 처리')],
  ['교환권: 관리자 이름 찾기', kintounPanelHtml.includes('이름으로 찾기')],
  ['근두운: 관리자 일반용·무지개용 안내', kintounPanelHtml.includes('일반용') && kintounPanelHtml.includes('무지개용')],
  ['히든: 홈에 검은용 안내 없음', !homeHtml.includes('검은용')],
  ['히든: 홈에 확률 안내 없음', !/10,?000\s*분의\s*1|1\s*\/\s*10,?000|0\.0001/.test(homeHtml)],
  ['히든: 관리자에 확률 안내 없음', !kintounPanelHtml.includes('검은용') && !/1\s*\/\s*10,?000|0\.0001/.test(kintounPanelHtml)],
  ['히든: 교환권 없는 학생에게 시크릿쿠폰 없음', !homeHtml.includes('시크릿') && !kintounPanelHtml.includes('시크릿')],
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

/* 관리자 「수업 종료」 — 활성 세션 카드 버튼·확인 창 */
const liveRowHtml = rendered['LiveSessionRow(수업 종료 버튼)'] ?? ''
const endModalHtml = rendered['EndStudyModal(수업 종료 확인)'] ?? ''
const endStudyChecks: [string, boolean][] = [
  ['수업 종료: 활성 세션 카드에 버튼', liveRowHtml.includes('>수업 종료<')],
  ['수업 종료: 학생 이름이 붙은 접근성 이름', liveRowHtml.includes('aria-label="김민수 수업 종료"')],
  ['수업 종료: 카드에 상태·시간', liveRowHtml.includes('공부 중') && liveRowHtml.includes('25:31')],
  ['수업 종료: 이름·닉네임·학원 배지', liveRowHtml.includes('김민수') && liveRowHtml.includes('열공몬') && liveRowHtml.includes('🏫')],
  ['수업 종료: 드래곤볼 쏘기 버튼은 그대로', liveRowHtml.includes('에게 드래곤볼 3개 쏘기')],
  ['수업 종료 확인: 제목·학생 이름', endModalHtml.includes('수업을 마칠까요?') && endModalHtml.includes('김민수')],
  ['수업 종료 확인: 지금까지의 시간(25분)', endModalHtml.includes('지금까지') && /25(?:<!-- -->)?분/.test(endModalHtml)],
  ['수업 종료 확인: 문제 수 입력칸', endModalHtml.includes('오늘 푼 문제 수 (선택)') && endModalHtml.includes('value="7"')],
  ['수업 종료 확인: 비우면 0문제 안내', endModalHtml.includes('0문제')],
  ['수업 종료 확인: 학원은 바로 기록 안내', endModalHtml.includes('바로 들어가요')],
  ['수업 종료 확인: 취소·종료 버튼', endModalHtml.includes('>취소<') && endModalHtml.includes('>수업 종료<')],
  ['수업 종료 확인: 학생 화면이 바뀐다는 안내', endModalHtml.includes('결과 화면으로 바뀌어요')],
]
for (const [name, ok] of endStudyChecks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
}

/* 통계 학원·숙제 분리 (대시보드·랭킹) */
const dashboardHtml = rendered['Dashboard'] ?? ''
const rankingHtml = rendered['RankingPanel'] ?? ''
const statsSplitChecks: [string, boolean][] = [
  ['분리: 대시보드 구분 필터', dashboardHtml.includes('aria-label="통계 구분"')],
  ['분리: 대시보드 학원·숙제 카드', dashboardHtml.includes('🏫 학원 공부') && dashboardHtml.includes('🏠 숙제 공부')],
  ['분리: 대시보드 합계 카드', dashboardHtml.includes('>합계<')],
  ['분리: 학생 비교 구분 필터', dashboardHtml.includes('aria-label="학생 비교 구분"')],
  ['분리: 표 구분 필터', dashboardHtml.includes('aria-label="표 구분"')],
  ['분리: 미제출 학원·숙제 안내', dashboardHtml.includes('아래 숫자로 학원·숙제를 따로 볼 수 있어요')],
  ['분리: 랭킹 학원·숙제 분리 안내', rankingHtml.includes('전체 / 🏫 학원 / 🏠 숙제로 따로')],
]
for (const [name, ok] of statsSplitChecks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
}

/* 쉬는 시간 30분 알림 · 60분 자동 종료 · 다음 접속 때 문제 수 입력 */
const pausedHtml = rendered['TimerScreen(쉬는 중)'] ?? ''
const pendingHtml = rendered['PendingProblemsModal(지난 공부 문제 수)'] ?? ''
const pendingHomeHtml = rendered['StudentHomeScreen(지난 공부 문제 수 있음)'] ?? ''
const pauseChecks: [string, boolean][] = [
  ['일시정지: 타이머에 일시정지 표시', pausedHtml.includes('일시정지 중이에요')],
  ['일시정지: 쉬는 시간 표시', pausedHtml.includes('쉬는 지')],
  ['일시정지: 자동 마무리 안내', pausedHtml.includes('자동으로 마무리')],
  ['일시정지: 계속 버튼', pausedHtml.includes('>계속<')],
  ['문제 수: 지난 공부 제목', pendingHtml.includes('지난번 푼 문제 수')],
  ['문제 수: 지난 공부 요약(날짜·종류·시간)', pendingHtml.includes('11월 21일') && pendingHtml.includes('학원 공부') && pendingHtml.includes('1시간 20분')],
  ['문제 수: 0도 가능 안내', pendingHtml.includes('0을 누르고 저장')],
  ['문제 수: 건너뛰기 버튼', pendingHtml.includes('건너뛰기')],
  ['문제 수: 저장 버튼', pendingHtml.includes('>저장<')],
  ['문제 수: 홈에도 새로 입력할 카드', pendingHomeHtml.includes('지난번 푼 문제 수')],
  ['문제 수: 홈 카드에 건수', pendingHomeHtml.includes('2개')],
  ['문제 수: 홈 카드 안내 문구', pendingHomeHtml.includes('자동으로 마무리된 공부가 있어요')],
  ['문제 수: 남은 공부가 없으면 홈 카드 없음', !homeHtml.includes('자동으로 마무리된 공부가 있어요')],
]
for (const [name, ok] of pauseChecks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
}

/* 숙제 공부 사진 인증 · 시간/문항수 분리 승인 · 관리자 숙제관리 */
const pendingHomeworkHtml = rendered['PendingProblemsModal(지난 숙제 제출)'] ?? ''
const homeworkPickerHtml = rendered['HomeworkPhotoPicker(사진 없음)'] ?? ''
const homeworkPickerStatesHtml = rendered['HomeworkPhotoPicker(올리는 중·올라감)'] ?? ''
const homeworkPickerTwoHtml = rendered['HomeworkPhotoPicker(사진 두 장)'] ?? ''
const photoPagerHtml = rendered['PhotoPager(사진 2장)'] ?? ''
const homeworkPanelHtml = rendered['HomeworkPanel(관리자 숙제관리)'] ?? ''
const homeworkResultHtml = rendered['ResultScreen(숙제 승인 대기)'] ?? ''
const homeworkRowHtml = rendered['HomeworkSubmissionRow(선생님 한마디)'] ?? ''
const homeworkRejectedRowHtml = rendered['HomeworkSubmissionRow(반려)'] ?? ''
const praiseHtml = rendered['PraiseEditor(선생님 칭찬 한마디)'] ?? ''
const praiseLockedHtml = rendered['PraiseEditor(모두 반려)'] ?? ''
/* 사진 input 태그 — 카메라(바로 찍기) / 앨범 */
const cameraInputTag = homeworkPickerHtml.match(/<input[^>]*data-photo-input="camera"[^>]*>/)?.[0] ?? ''
const albumInputTag = homeworkPickerHtml.match(/<input[^>]*data-photo-input="album"[^>]*>/)?.[0] ?? ''

const homeworkChecks: [string, boolean][] = [
  ['숙제: 지난 숙제 제출 창 제목', pendingHomeworkHtml.includes('지난 숙제 공부 제출')],
  ['숙제: 지난 숙제에도 확정 안내 문구', pendingHomeworkHtml.includes('오늘 공부한 페이지를 찍어올리고 푼 문제수를 적어주세요')],
  ['숙제: 지난 제출 요약', pendingHomeworkHtml.includes('11월 21일') && pendingHomeworkHtml.includes('1시간 20분')],
  ['숙제: 지난 제출에 사진 고르기', pendingHomeworkHtml.includes('공부한 페이지 사진') && pendingHomeworkHtml.includes('바로 찍기') && pendingHomeworkHtml.includes('앨범에서 고르기')],
  ['숙제: 지난 제출에 제출 버튼', pendingHomeworkHtml.includes('>제출<')],
  ['숙제: 사진 고르기 최대 5장 표시', homeworkPickerHtml.includes('0/5') && homeworkPickerHtml.includes('사진 없이도 제출할 수 있어요')],
  ['숙제: 사진이 없어도 막지 않는다는 안내', !homeworkPickerHtml.includes('1장 이상 올려주세요')],
  ['숙제: 바로 찍기·앨범에서 고르기 두 버튼', homeworkPickerHtml.includes('📷 바로 찍기') && homeworkPickerHtml.includes('🖼️ 앨범에서 고르기')],
  ['숙제: 카메라는 capture=environment · 한 장', cameraInputTag.includes('capture="environment"') && !cameraInputTag.includes('multiple')],
  ['숙제: 앨범은 여러 장(multiple)', albumInputTag.includes('multiple') && !albumInputTag.includes('capture')],
  ['숙제: 사진 input 은 숨기지 않고 투명 오버레이', cameraInputTag.includes('opacity-0') && !cameraInputTag.includes('hidden') && albumInputTag.includes('opacity-0')],
  ['숙제: 사진 크게 보기 좌우 넘기기', photoPagerHtml.includes('1 / 2') && photoPagerHtml.includes('이전 사진') && photoPagerHtml.includes('다음 사진')],
  ['숙제: 관리자 숙제관리 탭 내용', homeworkPanelHtml.includes('숙제 제출 확인') && homeworkPanelHtml.includes('승인 대기')],
  ['숙제: 관리자 필터 네 가지', ['승인 대기', '승인', '반려', '전체'].every((label) => homeworkPanelHtml.includes(label))],
  ['숙제: 관리자 설명에 승인한 항목만 반영', homeworkPanelHtml.includes('승인한 항목만') && homeworkPanelHtml.includes('드래곤볼과는')],
  ['숙제: 결과 화면에 승인 대기 안내', homeworkResultHtml.includes('선생님 확인을 기다려요') && homeworkResultHtml.includes('오늘 기록에 들어가요')],
  ['숙제: 결과 화면에 오늘 기록(승인된 것)', homeworkResultHtml.includes('오늘 기록(승인된 것)')],
  ['숙제: 관리자 탭 배지 자리', adminHtml.includes('숙제관리')],
  ['숙제: 사진 올리는 중 표시', homeworkPickerStatesHtml.includes('올리는 중…')],
  ['숙제: 사진 실패 표시', homeworkPickerStatesHtml.includes('다시 올려 주세요') && homeworkPickerStatesHtml.includes('올리지 못한 사진이 있어요')],
  ['숙제: 사진 세 장이면 3/5', homeworkPickerStatesHtml.includes('3/5')],
  ['숙제: 고르면 줄여서 바로 올라간다는 안내', homeworkPickerTwoHtml.includes('줄여서 바로 올라가요')],
  ['숙제: 사진 두 장이면 2/5', homeworkPickerTwoHtml.includes('2/5')],
  ['숙제: 사진 미리 보기 두 장', (homeworkPickerTwoHtml.match(/<img /g) ?? []).length === 2],
  ['숙제: 승인한 건에 민트색 선생님 한마디 박스', homeworkRowHtml.includes('선생님 한마디') && homeworkRowHtml.includes('풀이가 꼼꼼해요') && homeworkRowHtml.includes('E9FAF0')],
  ['숙제: 반려 건에는 칭찬 박스 없음·반려 사유 있음', !homeworkRejectedRowHtml.includes('선생님 한마디') && !homeworkRejectedRowHtml.includes('E9FAF0') && homeworkRejectedRowHtml.includes('반려 사유:') && homeworkRejectedRowHtml.includes('풀이 흔적 부족')],
  ['숙제: 관리자 칭찬 칩 다섯 개', ['풀이가 꼼꼼해요', '글씨가 깔끔해요', '어려운 문제 잘 고민했어요', '꾸준히 잘하고 있어요', '스스로 잘 풀었어요'].every((chip) => praiseHtml.includes(chip))],
  ['숙제: 칭찬 칸 안내(선택·비우면 그대로 승인)', praiseHtml.includes('선생님 칭찬 한마디') && praiseHtml.includes('비워 두면 한마디 없이 예전처럼 승인돼요')],
  ['숙제: 모두 반려면 칭찬칸 잠금·안내', praiseLockedHtml.includes('모두 반려하면 칭찬 한마디는 저장되지 않아요') && praiseLockedHtml.includes('disabled')],
]
for (const [name, ok] of homeworkChecks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
}

/* 문제 수 0~999 상한 · 오늘 학원 문제 수 수정 (2026-11-23) */
const academyResultHtml = rendered['ResultScreen(학원 — 오늘 기록 있음)'] ?? ''
const plainResultHtml = rendered['ResultScreen'] ?? ''
const editModalHtml = rendered['EditAcademyProblemsModal(오늘 학원 문제 수)'] ?? ''
const endStudyHtml = rendered['EndStudyModal(수업 종료 확인)'] ?? ''
const problemChecks: [string, boolean][] = [
  ['문제 수정: 학원 결과 화면에 수정 버튼', academyResultHtml.includes('문제 수 수정')],
  ['문제 수정: 수정 창 제목', editModalHtml.includes('오늘 학원 공부 문제 수')],
  ['문제 수정: 지금 기록·범위 안내', editModalHtml.includes('지금 기록') && editModalHtml.includes('0~999문제까지')],
  ['문제 수정: 숙제는 승인 뒤에 들어간다는 안내', editModalHtml.includes('숙제 공부 문제 수는 선생님 확인 뒤에')],
  ['문제 수정: 지금 값 12로 채워짐', editModalHtml.includes('>12<')],
  ['문제 수정: 취소·저장 버튼', editModalHtml.includes('>취소<') && editModalHtml.includes('>저장<')],
  ['문제 수정: 기록 없는 결과 화면에는 버튼 없음', !plainResultHtml.includes('문제 수 수정')],
  ['문제 수정: 숙제 승인 대기 화면에는 버튼 없음', !homeworkResultHtml.includes('문제 수 수정')],
  ['문제 수정: 관리자 수업 종료 입력칸 max 999', endStudyHtml.includes('max="999"')],
]
for (const [name, ok] of problemChecks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
}

console.log(failed === 0 ? 'ALL SCREENS RENDERED' : `${failed} FAILED`)
