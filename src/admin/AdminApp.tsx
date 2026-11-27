import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react'
import { BrandFooter, Mascot } from '../components/Brand'
import { ErrorBoundary } from '../components/ErrorBoundary'
import {
  ADMIN_TAB_ORDER,
  gestureFrom,
  isSingleTouch,
  resolveTabSwipe,
  swipeBlockReason,
  type AdminTab,
  type SwipeNode,
} from '../lib/adminSwipe'
import * as questionsApi from '../lib/questions'
import * as homeworkApi from '../lib/homework'
import { isSupabaseConfigured } from '../lib/supabase'
import { AdminLogin } from './AdminLogin'
import { Dashboard } from './Dashboard'
import { HomeworkPanel } from './HomeworkPanel'
import { KintounPanel } from './KintounPanel'
import { QuestionsPanel } from './QuestionsPanel'
import { RankingPanel } from './RankingPanel'
import { useStudents } from './useStudents'

const STORAGE_KEY = 'sunogong.admin-signed-in'

type Tab = AdminTab

const TABS: Tab[] = [...ADMIN_TAB_ORDER]

type SwipeStart = { x: number; y: number; identifier: number; target: SwipeNode | null }

function readSignedIn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** 알림을 눌러 열 때(`/admin?tab=questions`) 바로 질문함이 보이게 한다 */
function readInitialTab(): Tab {
  try {
    const value = new URLSearchParams(window.location.search).get('tab')
    if (value && (TABS as string[]).includes(value)) return value as Tab
  } catch {
    /* 주소를 읽지 못하면 대시보드 */
  }
  return 'dashboard'
}

export interface AdminAppProps {
  onBack: () => void
}

/**
 * 관리자 화면: 대시보드 · 실시간 · 숙제관리 · 질문함 · 랭킹 (모바일에서는 좌우로 밀어 탭 이동)
 *
 * 「학생 관리」 탭은 2026-11-27 에 뺐다 — 원생 정보·닉네임 관리는 통합 앱 「훈출」(`원생·포인트`)에서 한곳으로 맡는다.
 * 학생 이름·닉네임은 대시보드·실시간·랭킹 화면에 그대로 보인다.
 */
export function AdminApp({ onBack }: AdminAppProps): JSX.Element {
  const [signedIn, setSignedIn] = useState(readSignedIn)
  const [tab, setTab] = useState<Tab>(readInitialTab)
  const [unanswered, setUnanswered] = useState(0)
  const [pendingHomework, setPendingHomework] = useState(0)
  const { students, loading, error, reload } = useStudents()

  /* 모바일 좌우 스와이프로 탭 이동 — 손가락이 닿은 곳과 뗀 곳만 본다 */
  const swipeRef = useRef<HTMLDivElement | null>(null)
  const swipeStart = useRef<SwipeStart | null>(null)

  /** 질문함 탭 배지 — 답변 대기 질문 수 (질문 기능이 없어도 조용히 0) */
  const refreshUnanswered = useCallback(() => {
    void questionsApi.countUnansweredQuestions().then((res) => {
      if (res.ok) setUnanswered(res.data)
    })
  }, [])

  useEffect(() => {
    if (!signedIn) return
    refreshUnanswered()
    const id = window.setInterval(refreshUnanswered, 60_000)
    return () => window.clearInterval(id)
  }, [signedIn, refreshUnanswered])

  /** 숙제관리 탭 배지 — 승인 대기 숙제 제출 수 */
  const refreshPendingHomework = useCallback(() => {
    void homeworkApi.countPendingHomework().then((res) => {
      if (res.ok) setPendingHomework(res.data)
    })
  }, [])

  useEffect(() => {
    if (!signedIn) return
    refreshPendingHomework()
    const id = window.setInterval(refreshPendingHomework, 60_000)
    return () => window.clearInterval(id)
  }, [signedIn, refreshPendingHomework])

  const signIn = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* 저장 실패해도 이번 세션은 진행 */
    }
    setSignedIn(true)
  }

  const changeTab = (next: Tab) => {
    setTab(next)
    if (next === 'questions') refreshUnanswered()
    if (next === 'homework') refreshPendingHomework()
  }

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!isSingleTouch(event.touches.length)) {
      swipeStart.current = null
      return
    }
    const touch = event.touches[0]
    swipeStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      identifier: touch.identifier,
      target: (event.target as SwipeNode | null) ?? null,
    }
  }

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return
    const touch =
      Array.from(event.changedTouches).find((item) => item.identifier === start.identifier) ?? event.changedTouches[0]
    if (!touch) return
    const next = resolveTabSwipe({
      ...gestureFrom(start, { x: touch.clientX, y: touch.clientY }),
      index: TABS.indexOf(tab),
      blocked: swipeBlockReason(start.target, swipeRef.current) !== null,
    })
    if (next === null) return
    changeTab(TABS[next])
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
    <div
      ref={swipeRef}
      className="screen bg-blue-soft/40"
      data-admin-swipe="tab"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => {
        swipeStart.current = null
      }}
    >
      <header className="sticky top-0 z-30 border-b border-blue-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Mascot variant="face" className="h-10 w-10" />
          <div className="min-w-0 flex-1">
            <h1 className="whitespace-nowrap font-round text-[18px] font-extrabold leading-none text-navy sm:text-[20px]">선오공 관리자</h1>
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
              { key: 'kintoun', label: '실시간' },
              { key: 'homework', label: '숙제관리' },
              { key: 'questions', label: '질문함' },
              { key: 'ranking', label: '랭킹' },
            ] as { key: Tab; label: string }[]
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => changeTab(item.key)}
              className={`relative shrink-0 rounded-full px-4 py-1.5 text-[12px] font-bold transition ${
                tab === item.key ? 'bg-navy text-white shadow-soft' : 'text-navy/55 hover:bg-blue-soft'
              }`}
            >
              {item.label}
              {item.key === 'questions' && unanswered > 0 ? (
                <span
                  className={`ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular ${
                    tab === 'questions' ? 'bg-white text-navy' : 'bg-red-500 text-white'
                  }`}
                >
                  {unanswered > 99 ? '99+' : unanswered}
                </span>
              ) : null}
              {item.key === 'homework' && pendingHomework > 0 ? (
                <span
                  className={`ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular ${
                    tab === 'homework' ? 'bg-white text-navy' : 'bg-[#E9A400] text-white'
                  }`}
                >
                  {pendingHomework > 99 ? '99+' : pendingHomework}
                </span>
              ) : null}
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
          {tab === 'questions' ? <QuestionsPanel onUnansweredChange={setUnanswered} /> : null}
          {tab === 'homework' ? <HomeworkPanel onPendingChange={setPendingHomework} /> : null}
          {tab === 'kintoun' ? (
            <KintounPanel
              students={students}
              studentsLoading={loading}
              studentsError={error}
              reloadStudents={() => void reload()}
            />
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
