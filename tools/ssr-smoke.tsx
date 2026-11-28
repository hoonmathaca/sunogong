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
import { DayDetailModal } from '../src/admin/DayDetailModal'
import { DragonballBulk } from '../src/admin/DragonballBulk'
import { DualTrendChart } from '../src/admin/Charts'
import { indexLogs } from '../src/lib/stats'
import type { StudyLog } from '../src/lib/types'
import { LiveSessionRow } from '../src/admin/LiveSessionRow'
import { EndStudyModal } from '../src/admin/EndStudyModal'
import type { AdminLiveSession } from '../src/lib/kintoun'
import { QuestionsPanel } from '../src/admin/QuestionsPanel'
import { PushNotifyPanel } from '../src/admin/PushNotifyPanel'
import { RankingPanel } from '../src/admin/RankingPanel'
import { ADMIN_TAB_ORDER } from '../src/lib/adminSwipe'
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
import { StudentStudyCalendar } from '../src/student/StudentStudyCalendar'
import { buildDayViews } from '../src/lib/studentCalendar'
import { TimerScreen } from '../src/student/TimerScreen'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { PhotoPager } from '../src/components/PhotoPager'
import { InAppCamera } from '../src/components/InAppCamera'
import { HomeworkPanel } from '../src/admin/HomeworkPanel'
import { PraiseEditor } from '../src/admin/PraiseEditor'
import { HomeworkSubmissionRow } from '../src/student/HomeworkSubmissionRow'
import { DesktopBlockScreen } from '../src/components/DesktopBlockScreen'
import type { FinishResult, HomeworkSubmission, Student, StudySession, StudentDayRecord } from '../src/lib/types'
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


/* 달력·날짜 상세 확인용 — 같은 달 같은 날 학원/숙제 기록 두 학생 */
const calendarStudents: Student[] = [
  student,
  {
    id: 'cal-student-2',
    name: '김민수',
    code: '4123',
    grade: '중2',
    created_at: '2026-11-19T00:00:00Z',
    nickname: '열공몬',
  },
  {
    id: 'cal-student-3',
    name: '박서연',
    code: '5252',
    grade: '중1',
    created_at: '2026-11-19T00:00:00Z',
  },
]
const calendarLogs: StudyLog[] = [
  {
    id: 'cal-log-1',
    student_id: student.id,
    date: '2026-11-25',
    minutes: 70,
    problems: 9,
    academy_minutes: 70,
    academy_problems: 9,
    homework_minutes: 0,
    homework_problems: 0,
    updated_at: '2026-11-25T10:00:00Z',
  },
  {
    id: 'cal-log-2',
    student_id: 'cal-student-2',
    date: '2026-11-25',
    minutes: 40,
    problems: 6,
    academy_minutes: 0,
    academy_problems: 0,
    homework_minutes: 40,
    homework_problems: 6,
    updated_at: '2026-11-25T10:00:00Z',
  },
  {
    id: 'cal-log-3',
    student_id: 'cal-student-2',
    date: '2026-11-26',
    minutes: 95,
    problems: 13,
    academy_minutes: 60,
    academy_problems: 8,
    homework_minutes: 35,
    homework_problems: 5,
    updated_at: '2026-11-26T10:00:00Z',
  },
]
const calendarIndex = indexLogs(calendarLogs)
const dualPoints = [
  { date: '2026-11-24', academy: 30, homework: 0 },
  { date: '2026-11-25', academy: 70, homework: 20 },
  { date: '2026-11-26', academy: 60, homework: 35 },
]

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


/* 학생 「공부 기록」 달력 — 11월 실제 모양(김도혁 11/27 과 같은 값) + 경계 날들 (2026-11-28) */
const calRecords: StudentDayRecord[] = [
  {
    record_date: '2026-11-20',
    check_in_at: '2026-11-20T06:36:00+00:00',
    check_out_at: '2026-11-20T08:48:00+00:00',
    check_out_auto: false,
    check_out_missing: false,
    visits: 1,
    academy_minutes: 131,
    academy_problems: 43,
    homework_minutes: 40,
    homework_problems: 6,
  },
  {
    record_date: '2026-11-21',
    check_in_at: '2026-11-21T06:31:00+00:00',
    check_out_at: '2026-11-21T12:30:00+00:00',
    check_out_auto: true,
    check_out_missing: false,
    visits: 1,
    academy_minutes: 120,
    academy_problems: 38,
    homework_minutes: 0,
    homework_problems: 0,
  },
  {
    record_date: '2026-11-22',
    check_in_at: '2026-11-22T06:30:00+00:00',
    check_out_at: null,
    check_out_auto: false,
    check_out_missing: true,
    visits: 1,
    academy_minutes: 60,
    academy_problems: 20,
    homework_minutes: 0,
    homework_problems: 0,
  },
  {
    record_date: '2026-10-15',
    check_in_at: '2026-10-15T06:10:00+00:00',
    check_out_at: '2026-10-15T08:20:00+00:00',
    check_out_auto: false,
    check_out_missing: false,
    visits: 1,
    academy_minutes: 0,
    academy_problems: 0,
    homework_minutes: 0,
    homework_problems: 0,
  },
]
/* 11/24 — 훈출 키오스크를 안 쓴 날: 등·하원 없이 공부 기록만 */
const calViews = buildDayViews(calRecords, [
  {
    id: 'cal-log-1',
    student_id: student.id,
    date: '2026-11-24',
    minutes: 135,
    problems: 45,
    academy_minutes: 135,
    academy_problems: 45,
    homework_minutes: 0,
    homework_problems: 0,
    updated_at: '2026-11-24T09:00:00Z',
  },
])

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
    'InAppCamera(여는 중)',
    () => <InAppCamera onFiles={() => {}} onClose={() => {}} />,
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
    'StudentHomeScreen(선생님 답변 배너)',
    () => (
      <StudentHomeScreen
        student={student}
        onStart={() => {}}
        onExit={() => {}}
        onQuestions={() => {}}
        unreadAnswers={2}
        unreadAnswer={{
          id: 'q-banner',
          student_id: student.id,
          memo: '3번에서 막혔어요',
          image_path: 'a/1700000000000-token.jpg',
          answer: '통분하면 돼요',
          answer_media_path: null,
          answered_at: '2026-11-28T00:10:00Z',
          answered_by: '선오공이',
          student_read_at: null,
          created_at: '2026-11-27T05:00:00Z',
          updated_at: '2026-11-28T00:10:00Z',
        }}
        onOpenAnswer={() => {}}
        onConfirmAnswer={() => {}}
      />
    ),
  ],
  [
    'StudentHomeScreen(학원 등원 중)',
    () => (
      <StudentHomeScreen
        student={student}
        onStart={() => {}}
        onExit={() => {}}
        onQuestions={() => {}}
        unreadAnswers={0}
        academyActive
      />
    ),
  ],
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
  [
    'StudentStudyCalendar(11월 기록)',
    () => (
      <StudentStudyCalendar
        month="2026-11"
        today="2026-11-28"
        selectedDate="2026-11-20"
        views={calViews}
        onSelect={() => {}}
        onMonthChange={() => {}}
      />
    ),
  ],
  [
    'StudentStudyCalendar(자동 마감)',
    () => (
      <StudentStudyCalendar
        month="2026-11"
        today="2026-11-28"
        selectedDate="2026-11-21"
        views={calViews}
        onSelect={() => {}}
        onMonthChange={() => {}}
      />
    ),
  ],
  [
    'StudentStudyCalendar(재원 중)',
    () => (
      <StudentStudyCalendar
        month="2026-11"
        today="2026-11-28"
        selectedDate="2026-11-22"
        views={calViews}
        onSelect={() => {}}
        onMonthChange={() => {}}
      />
    ),
  ],
  [
    'StudentStudyCalendar(10월 출결만)',
    () => (
      <StudentStudyCalendar
        month="2026-10"
        today="2026-11-28"
        selectedDate="2026-10-15"
        views={calViews}
        onSelect={() => {}}
        onMonthChange={() => {}}
      />
    ),
  ],
  [
    'StudentStudyCalendar(기록 없는 날)',
    () => (
      <StudentStudyCalendar
        month="2026-11"
        today="2026-11-28"
        selectedDate="2026-11-25"
        views={calViews}
        onSelect={() => {}}
        onMonthChange={() => {}}
      />
    ),
  ],
  [
    'StudentStudyCalendar(불러오는 중)',
    () => (
      <StudentStudyCalendar
        month="2026-11"
        today="2026-11-28"
        selectedDate="2026-11-20"
        views={calViews}
        loading
        onSelect={() => {}}
        onMonthChange={() => {}}
      />
    ),
  ],
  ['QuestionBoardScreen', () => <QuestionBoardScreen student={student} onBack={() => {}} />],
  ['QuestionBoardScreen(답변 배너로 들어옴)', () => <QuestionBoardScreen student={student} focusId="q-banner" onBack={() => {}} />],
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
  [
    'DayDetailModal(날짜 상세)',
    () => (
      <DayDetailModal
        open
        date="2026-11-25"
        students={calendarStudents}
        index={calendarIndex}
        onClose={() => {}}
        onSent={() => {}}
      />
    ),
  ],
  [
    'DayDetailModal(기록 없는 날)',
    () => (
      <DayDetailModal
        open
        date="2026-11-20"
        students={calendarStudents}
        index={calendarIndex}
        onClose={() => {}}
        onSent={() => {}}
      />
    ),
  ],
  [
    'DragonballBulk(학원·숙제 일괄)',
    () => (
      <DragonballBulk
        academyIds={[student.id]}
        homeworkIds={['cal-student-2']}
        amount={2}
        onAmountChange={() => {}}
        date="2026-11-25"
        onSent={() => {}}
      />
    ),
  ],
  ['DualTrendChart(학원·숙제 두 선)', () => <DualTrendChart points={dualPoints} />],
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
  ['홈: 학원 공부 시작 버튼 없음(2026-11-26 제거)', !(rendered['StudentHomeScreen'] ?? '').includes('학원 공부 시작')],
  ['홈: 숙제 공부 시작 버튼은 그대로', (rendered['StudentHomeScreen'] ?? '').includes('숙제 공부 시작')],
  ['홈: 학원 등원 중 안내 문구', (rendered['StudentHomeScreen(학원 등원 중)'] ?? '').includes('학원 등원 중에는 숙제 공부를 시작할 수 없어요')],
  ['홈: 학원 등원 중이면 숙제 버튼 잠금(disabled)', (rendered['StudentHomeScreen(학원 등원 중)'] ?? '').includes('disabled=""')],
  ['홈: 학원 등원 중이면 버튼 라벨은 그대로', (rendered['StudentHomeScreen(학원 등원 중)'] ?? '').includes('숙제 공부 시작')],
  ['홈: 학원 등원 중이면 숙제 안내 문구 숨김', !(rendered['StudentHomeScreen(학원 등원 중)'] ?? '').includes('숙제 공부는 화면을 끄거나 나가면 멈춰요')],
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
  ['스와이프: 관리자 탭 다섯 개', ['실시간', '공부기록', '숙제관리', '질문함', '랭킹'].every((label) => adminHtml.includes(`>${label}<`) || adminHtml.includes(label))],
  ['스와이프: 관리자 탭에 「학생 관리」 없음', !adminHtml.includes('학생 관리')],
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


/* 공부기록 달력 날짜 상세 · 일괄 드래곤볼 · 두 선 그래프 (2026-11-28) */
/* JSX 텍스트 사이에 들어가는 SSR 주석(<!-- -->)은 빼고 글자만 본다 */
const plainText = (html: string) => html.replace(/<!--[^>]*-->/g, '')
const dayHtml = rendered['DayDetailModal(날짜 상세)'] ?? ''
const dayText = plainText(dayHtml)
const emptyDayText = plainText(rendered['DayDetailModal(기록 없는 날)'] ?? '')
const bulkText = plainText(rendered['DragonballBulk(학원·숙제 일괄)'] ?? '')
const dualHtml = rendered['DualTrendChart(학원·숙제 두 선)'] ?? ''
const calendarChecks: [string, boolean][] = [
  ['달력 상세: 날짜 제목', dayText.includes('11월 25일 (수)') && dayText.includes('공부 이력')],
  ['달력 상세: 학원 공부한 학생', dayText.includes('🏫 학원 공부한 학생 1명') && dayText.includes('이지빈')],
  ['달력 상세: 숙제 공부한 학생', dayText.includes('🏠 숙제 공부한 학생 1명') && dayText.includes('김민수')],
  ['달력 상세: 기록 없는 학생', dayText.includes('기록 없는 학생 1명') && dayText.includes('박서연')],
  ['달력 상세: 학원 공부 시간·푼 숙제', dayText.includes('70분 · 푼 숙제 9개')],
  ['달력 상세: 학원·숙제 일괄 버튼', dayText.includes('🏫 학원공부 일괄 1명') && dayText.includes('🏠 숙제공부 일괄 1명')],
  ['달력 상세: 개별 쏘기 버튼', dayText.includes('이지빈 학원공부 드래곤볼 쏘기') && dayText.includes('김민수 숙제공부 드래곤볼 쏘기')],
  ['달력 상세: 기록 없는 날 안내', emptyDayText.includes('이 날은 학원 공부 기록이 없어요') && emptyDayText.includes('이 날은 숙제 공부 기록이 없어요')],
  ['달력 상세: 관리자 화면에 푼 문제 없음', !dayText.includes('푼 문제')],
  ['일괄: 확인 전에는 확인 문구 없음', !bulkText.includes('쏠까요')],
  ['일괄: 개수 조절·랜덤 안내', bulkText.includes('1~7성구 랜덤') && bulkText.includes('1개 늘리기')],
  ['두 선 그래프: 학원·숙제 선 모두', dualHtml.includes('data-series="academy"') && dualHtml.includes('data-series="homework"')],
  ['두 선 그래프: 학원 파랑·숙제 빨강', dualHtml.includes('#1D4A9B') && dualHtml.includes('#E0453E')],
  ['오늘 공부 이력: 관리자 실시간 칸', plainText(kintounPanelHtml).includes('오늘 공부 이력') && plainText(kintounPanelHtml).includes('푼 숙제')],
]
for (const [name, ok] of calendarChecks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
}

/* 관리자 탭 — 「학생 관리」 탭은 2026-11-27 에 뺐다(원생 정보·닉네임 관리는 「훈출」의 원생·포인트에서) */
const adminTabChecks: [string, boolean][] = [
  ['관리자 탭: 학생 관리 없음', !(ADMIN_TAB_ORDER as readonly string[]).includes('students')],
  ['관리자 탭: 실시간·공부기록·숙제관리·질문함·랭킹 순서 5개', ADMIN_TAB_ORDER.join(',') === 'kintoun,dashboard,homework,questions,ranking'],
]
for (const [name, ok] of adminTabChecks) {
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
  ['수업 종료 확인: 문제 수 입력칸', endModalHtml.includes('오늘 푼 숙제 수 (선택)') && endModalHtml.includes('value="7"')],
  ['수업 종료 확인: 비우면 0개 안내', endModalHtml.includes('0개') && !endModalHtml.includes('0문제')],
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
  ['달력: 공부기록 달력 칸', dashboardHtml.includes('공부기록 달력')],
  ['달력: 학원·숙제 색 안내', dashboardHtml.includes('🏫 학원공부(파랑)') && dashboardHtml.includes('🏠 숙제공부(빨강)')],
  ['달력: 이전·다음 달 버튼', dashboardHtml.includes('aria-label="이전 달"') && dashboardHtml.includes('aria-label="다음 달"')],
  ['분리: 미제출 학원·숙제 안내', dashboardHtml.includes('아래 숫자로 학원·숙제를 따로 볼 수 있어요')],
  ['분리: 랭킹 학원·숙제 분리 안내', rankingHtml.includes('전체 / 🏫 학원 / 🏠 숙제로 따로')],
]
for (const [name, ok] of statsSplitChecks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
}

/* 「학파 숙빨」 — 학원 파랑·숙제 빨강 통일, 관리자 탭 이름·순서, 관리자 개수 「푼 숙제」 (2026-11-28) */
const dashboardText = plainText(dashboardHtml)
const adminShellText = plainText(adminHtml)
const adminAllHtml = [adminHtml, dashboardHtml, dayHtml, kintounPanelHtml, endModalHtml, liveRowHtml].join('')
const kindColorChecks: [string, boolean][] = [
  ['탭: 관리자 첫 화면은 실시간', adminShellText.includes('지금 공부 중인 학생')],
  ['탭: 「공부기록」 이름, 「대시보드」 없음', adminHtml.includes('>공부기록<') && !adminHtml.includes('>대시보드<')],
  ['색: 관리자 숙제 막대·버튼 빨강', dashboardHtml.includes('#E0453E') && dashboardHtml.includes('#D9382F')],
  ['색: 관리자 학원 파랑', dashboardHtml.includes('#1D4A9B')],
  ['색: 관리자 화면에 숙제 보라(#6D3BD6·#5B2FC0·#EDE4FF) 없음', !/#(?:6D3BD6|5B2FC0|EDE4FF)/i.test(adminAllHtml)],
  ['색: 학생 홈 숙제 시작 버튼 빨강', homeHtml.includes('bg-[#E0453E]') && !homeHtml.includes('bg-[#6D3BD6]')],
  ['색: 학생 홈 숙제 시간 칩 빨강', homeHtml.includes('bg-[#E0453E]/60')],
  ['색: 숙제 타이머 배지·안내 빨강', homeworkHtml.includes('bg-[#FFF1F0] text-[#D9382F]') && homeworkHtml.includes('bg-[#E0453E] text-white shadow-sm')],
  ['색: 학생 홈·숙제 타이머에 숙제 보라(#EDE4FF) 없음', !homeHtml.includes('#EDE4FF') && !homeworkHtml.includes('#EDE4FF')],
  ['색: 학원 타이머에는 숙제 빨강 없음', !academyHtml.includes('#E0453E')],
  ['문구: 관리자 공부기록에 「문제」 없음', !dashboardText.includes('문제')],
  ['문구: 관리자 화면 어디에도 「문제」 없음(질문 사진 제외)', !adminShellText.includes('문제') && !plainText(dayHtml).includes('문제') && !plainText(kintounPanelHtml).includes('문제')],
  ['문구: 관리자 카드는 「푼 숙제 N개」', /푼 숙제 (?:\d|<!-- -->\d)/.test(dashboardHtml)],
]
for (const [name, ok] of kindColorChecks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
}

/* 학생 「공부 기록」 달력 — 등·하원·자동 마감·공부 기록 없음 (2026-11-28) */
const calHtml = rendered['StudentStudyCalendar(11월 기록)'] ?? ''
const calAutoHtml = rendered['StudentStudyCalendar(자동 마감)'] ?? ''
const calInHtml = rendered['StudentStudyCalendar(재원 중)'] ?? ''
const calOctHtml = rendered['StudentStudyCalendar(10월 출결만)'] ?? ''
const calEmptyHtml = rendered['StudentStudyCalendar(기록 없는 날)'] ?? ''
const calLoadHtml = rendered['StudentStudyCalendar(불러오는 중)'] ?? ''
const studentCalendarChecks: [string, boolean][] = [
  ['학생달력: 달 이름', calHtml.includes('2026년 11월')],
  ['학생달력: 요일 머리', calHtml.includes('>일<') && calHtml.includes('>토<')],
  ['학생달력: 범례 학원·숙제', calHtml.includes('학원 공부') && calHtml.includes('숙제 공부')],
  ['학생달력: 고른 날 제목(요일까지)', calHtml.includes('11월 20일 (금)')],
  ['학생달력: 하루 합계 시간', calHtml.includes('총 2시간 51분')],
  ['학생달력: 등원 ~ 하원', calHtml.includes('15:36 등원 ~ 17:48 하원')],
  ['학생달력: 학원 공부 시간', calHtml.includes('2시간 11분')],
  ['학생달력: 학원 푼 문제', calHtml.includes('푼 문제 ') && calHtml.includes('43개')],
  ['학생달력: 숙제 푼 문제', calHtml.includes('6개')],
  ['학생달력: 자동 마감은 하원 시각 대신 안내', calAutoHtml.includes('15:31 등원 · 하원 미확인(자동 마감)')],
  ['학생달력: 재원 중 안내', calInHtml.includes('15:30 등원 · 아직 학원에 있어요')],
  ['학생달력: 10월은 등·하원만', calOctHtml.includes('15:10 등원 ~ 17:20 하원')],
  ['학생달력: 10월은 공부 시간 기록 없음', calOctHtml.includes('공부 시간 기록 없음')],
  ['학생달력: 기록 없는 날 안내', calEmptyHtml.includes('이 날은 등·하원도 공부 기록도 없어요')],
  ['학생달력: 아무 기록 없는 날은 「기록 없음」', calEmptyHtml.includes('기록 없음')],
  ['학생달력: 불러오는 중에는 상세 대신 스피너', !calLoadHtml.includes('총 2시간 51분') && calLoadHtml.includes('animate-spin')],
  ['학생달력: 앞으로의 날짜는 누를 수 없음', calHtml.includes('disabled=""')],
  ['학생달력: 오늘 날짜 표시', calHtml.includes('11월 28일 (토) 오늘')],
  ['학생달력: 날짜 칸에 학원·숙제 점', calHtml.includes('h-[5px] w-[5px] rounded-full bg-[#1D4A9B]') && calHtml.includes('h-[5px] w-[5px] rounded-full bg-[#E0453E]')],
]
for (const [name, ok] of studentCalendarChecks) {
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
const inAppCameraHtml = rendered['InAppCamera(여는 중)'] ?? ''
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
  [
    '숙제: 바로 찍기는 앱 카메라(서버 렌더는 사진 선택기 input)',
    cameraInputTag.includes('accept="image/*"') && !cameraInputTag.includes('capture') && cameraInputTag.includes('data-photo-input="camera"'),
  ],
  ['숙제: 앨범은 여러 장(multiple)', albumInputTag.includes('multiple') && !albumInputTag.includes('capture')],
  ['숙제: 사진 input 은 숨기지 않고 투명 오버레이', cameraInputTag.includes('opacity-0') && !cameraInputTag.includes('hidden') && albumInputTag.includes('opacity-0')],
  ['숙제: 사진 크게 보기 좌우 넘기기', photoPagerHtml.includes('1 / 2') && photoPagerHtml.includes('이전 사진') && photoPagerHtml.includes('다음 사진')],
  [
    '카메라: 앱 안 카메라 창(제목·영상·셔터·안내)',
    inAppCameraHtml.includes('사진 찍기') &&
      inAppCameraHtml.includes('<video') &&
      inAppCameraHtml.includes('data-inapp-camera-action="shutter"') &&
      inAppCameraHtml.includes('📸 찍기') &&
      inAppCameraHtml.includes('카메라를 여는 중…') &&
      inAppCameraHtml.includes('화면에 맞게 줄여서 올라가요'),
  ],
  [
    '카메라: 여는 중에는 셔터를 누를 수 없음',
    /data-inapp-camera-action="shutter"[^>]*disabled/.test(inAppCameraHtml),
  ],
  ['카메라: 찍은 사진은 1200px 이하로 줄인다', homeworkPickerHtml.includes('긴 변 1200px')],
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

/* 선생님 답변 알림 배너(2026-11-28) · 이미 확인한 숙제 다시 고치기(2026-11-28) */
const bannerHomeHtml = rendered['StudentHomeScreen(선생님 답변 배너)'] ?? ''
const plainHomeHtml = rendered['StudentHomeScreen(학원 등원 중)'] ?? ''
const focusBoardHtml = rendered['QuestionBoardScreen(답변 배너로 들어옴)'] ?? ''
const rereviewChecks: [string, boolean][] = [
  ['답변 배너: 홈 위쪽에 제목', bannerHomeHtml.includes('선생님 답변이 도착했어요!')],
  ['답변 배너: 답변 보기·확인했어요 버튼', bannerHomeHtml.includes('답변 보기') && bannerHomeHtml.includes('확인했어요')],
  ['답변 배너: 개수 표시(2개)', bannerHomeHtml.includes('새 답변 2개')],
  ['답변 배너: 어떤 질문인지 한 줄', bannerHomeHtml.includes('3번에서 막혔어요') && bannerHomeHtml.includes('질문에 답변이 달렸어요')],
  ['답변 배너: 오늘 공부 카드보다 위', bannerHomeHtml.indexOf('선생님 답변이 도착했어요!') < bannerHomeHtml.indexOf('오늘 공부한 시간')],
  ['답변 배너: 답이 없으면 안 보임', !plainHomeHtml.includes('선생님 답변이 도착했어요!')],
  ['답변 배너: 열기 전 질문 화면은 그대로', focusBoardHtml.includes('선오공에게 질문하기') && focusBoardHtml.includes('새 질문 올리기')],
  ['숙제: 확인 화면에 다시 고치기 안내', homeworkPanelHtml.includes('이미 확인한 제출도 다시 열어 고칠 수 있어요')],
]
for (const [name, ok] of rereviewChecks) {
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
  ['학원: 결과 화면에 공부 더 하기 없음(학원은 훈출이 시작)', !academyResultHtml.includes('공부 더 하기')],
  ['숙제: 결과 화면에 공부 더 하기는 그대로', homeworkResultHtml.includes('공부 더 하기')],
]
for (const [name, ok] of problemChecks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
}

console.log(failed === 0 ? 'ALL SCREENS RENDERED' : `${failed} FAILED`)
