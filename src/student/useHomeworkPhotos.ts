import { useCallback, useEffect, useRef, useState } from 'react'
import * as homeworkApi from '../lib/homework'
import { HOMEWORK_PHOTO_MAX } from '../lib/homeworkBoard'
import {
  draftProblemsOf,
  draftProblemsText,
  newPhotoItem,
  photoPathsOf,
  restorePhotoItems,
  shouldReopenDraft,
  type HomeworkPhotoItem,
} from '../lib/homeworkPhotos'
import { isPhotoFile } from '../lib/photoPick'

export interface HomeworkPhotosInitial {
  /** 이미 올라가 있는 사진 경로 (제출 줄에 저장된 것) */
  photoPaths?: string[] | null
  /** 저장돼 있던 문제 수 */
  problems?: number | null
  /** 그 창이 열려 있었는지 */
  open?: boolean | null
}

interface UseHomeworkPhotosOptions {
  studentId: string
  /** 타이머 화면에서 마칠 때 — 아직 안 끝난 숙제 세션의 초안 */
  sessionId?: string | null
  /** 다음 접속 때 「지난 숙제 공부 제출」 — 자동 종료된 제출의 초안 */
  submissionId?: string | null
  /** 화면에 들어올 때 서버 초안을 읽어 되살릴지 (기본 true) */
  autoRestore?: boolean
  /** 서버에서 읽지 않고 넘겨받은 값으로 시작할 때 */
  initial?: HomeworkPhotosInitial | null
}

export interface HomeworkPhotos {
  items: HomeworkPhotoItem[]
  /** 입력 중인 문제 수 (문자열) */
  problems: string
  /** 서버 초안을 읽는 중 */
  loading: boolean
  /** 한 장이라도 올리는 중 */
  uploading: boolean
  error: string | null
  /** 다시 접속했을 때 「숙제 공부 제출」 창을 그대로 다시 열어야 한다 */
  reopen: boolean
  /** 다시 연 것을 화면이 확인했으면 부른다 */
  clearReopen: () => void
  pushDigit: (digit: string) => void
  popDigit: () => void
  setProblems: (value: string) => void
  addFiles: (files: File[]) => Promise<void>
  remove: (key: string) => void
  /** 제출 창을 열었다 — 초안에 open=true 로 남겨, 튕겨도 다시 열리게 */
  begin: () => void
  /** 제출 창을 그냥 닫았다 — 초안은 남기고 open=false */
  leave: () => void
  /** 아직 못 올린 사진을 마저 올리고 제출할 경로 목록을 돌려준다 */
  flush: () => Promise<{ ok: boolean; paths: string[]; error?: string }>
  /** 제출이 끝났다 — 화면 목록·문제 수를 비운다 */
  reset: () => void
  /** 초안 자체를 지운다(사진 파일도 Storage 에서 지운다) */
  discard: () => Promise<void>
}

/**
 * 숙제 사진 초안 — 고르는 즉시 한 장씩 줄여 올리고, 그때마다 DB 초안에 저장한다.
 *
 * 안드로이드에서 카메라 앱을 열면 브라우저 탭이 메모리 부족으로 강제 새로고침(튕김)되는 일이 있다.
 * 사진과 문제 수를 화면(React 상태)에만 두면 그때 전부 사라지므로,
 *   · 사진 1장을 고를 때마다 바로 Storage 업로드 → 경로를 초안에 저장
 *   · 문제 수를 누를 때마다 초안에 저장
 *   · 제출 창이 열려 있었는지(draft_open)도 초안에 저장
 * 해 두고, 다시 접속하면 이 초안으로 「숙제 공부 제출」 창을 그대로 되살린다.
 */
export function useHomeworkPhotos({
  studentId,
  sessionId = null,
  submissionId = null,
  autoRestore = true,
  initial = null,
}: UseHomeworkPhotosOptions): HomeworkPhotos {
  const [items, setItems] = useState<HomeworkPhotoItem[]>([])
  const [problems, setProblemsState] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reopen, setReopen] = useState(false)

  const itemsRef = useRef<HomeworkPhotoItem[]>([])
  const problemsRef = useRef('')
  const openRef = useRef(false)
  const mountedRef = useRef(true)
  const inFlightRef = useRef<Set<string>>(new Set())
  const pumpingRef = useRef(false)
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve())
  const lastSavedRef = useRef('')
  const targeted = Boolean(sessionId || submissionId)

  useEffect(() => {
    itemsRef.current = items
  }, [items])
  useEffect(() => {
    problemsRef.current = problems
  }, [problems])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      for (const item of itemsRef.current) {
        if (item.preview && item.preview.startsWith('blob:')) URL.revokeObjectURL(item.preview)
      }
    }
  }, [])

  /* ── 초안 저장 (한 번에 하나씩 차례로 — 늦게 도착한 옛 저장이 새 값을 덮지 않게) ── */
  const persist = useCallback(
    (next?: { open?: boolean; force?: boolean }) => {
      if (!targeted) return
      if (next && typeof next.open === 'boolean') openRef.current = next.open
      const payload = {
        sessionId: sessionId ?? null,
        submissionId: submissionId ?? null,
        problems: draftProblemsOf(problemsRef.current),
        photoPaths: photoPathsOf(itemsRef.current),
        open: openRef.current,
      }
      const signature = JSON.stringify(payload)
      if (!next?.force && signature === lastSavedRef.current) return
      lastSavedRef.current = signature
      saveChainRef.current = saveChainRef.current
        .then(async () => {
          const res = await homeworkApi.saveHomeworkDraft(payload)
          // 마이그레이션 전(함수 없음)에는 초안을 못 남긴다 — 사진은 Storage 에는 올라간다
          if (!res.ok) console.warn('[sunogong] 숙제 초안 저장 실패:', res.error)
        })
        .catch(() => undefined)
    },
    [sessionId, submissionId, targeted],
  )

  const applyRestored = useCallback(
    (paths: string[], urls: Record<string, string>, problemText: string, open: boolean) => {
      if (paths.length > 0 && itemsRef.current.length === 0) {
        const restored = restorePhotoItems(paths, urls)
        setItems(restored)
        itemsRef.current = restored
      }
      if (problemText && !problemsRef.current) {
        setProblemsState(problemText)
        problemsRef.current = problemText
      }
      openRef.current = open
      lastSavedRef.current = JSON.stringify({
        sessionId: sessionId ?? null,
        submissionId: submissionId ?? null,
        problems: draftProblemsOf(problemText),
        photoPaths: paths,
        open,
      })
    },
    [sessionId, submissionId],
  )

  /* ── 서버 초안 읽어 되살리기 ─────────────────────────────────────── */
  const restore = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    const res = await homeworkApi.findHomeworkDraft(sessionId)
    if (!mountedRef.current) return
    setLoading(false)
    if (!res.ok || !res.data) return
    const draft = res.data
    if (!draft.draft_active) return

    const paths = (draft.photo_paths ?? []).filter((path) => Boolean(path))
    let urls: Record<string, string> = {}
    if (paths.length > 0) urls = await homeworkApi.signHomeworkPhotos(paths)
    if (!mountedRef.current) return

    applyRestored(paths, urls, draftProblemsText(draft.draft_problems), Boolean(draft.draft_open))
    if (shouldReopenDraft(draft)) setReopen(true)
  }, [sessionId, applyRestored])

  useEffect(() => {
    if (!autoRestore) return
    setItems([])
    itemsRef.current = []
    setProblemsState('')
    problemsRef.current = ''
    setReopen(false)
    lastSavedRef.current = ''
    inFlightRef.current = new Set()

    if (sessionId) {
      void restore()
      return
    }
    if (submissionId && initial) {
      const paths = (initial.photoPaths ?? []).filter((path) => Boolean(path))
      if (paths.length === 0 && (initial.problems === null || initial.problems === undefined) && !initial.open) return
      void (async () => {
        setLoading(true)
        const urls = paths.length > 0 ? await homeworkApi.signHomeworkPhotos(paths) : {}
        if (!mountedRef.current) return
        setLoading(false)
        applyRestored(paths, urls, draftProblemsText(initial.problems), Boolean(initial.open))
      })()
    }
    // initial 은 처음 값만 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, submissionId, autoRestore, restore, applyRestored])

  const setProblems = useCallback(
    (value: string) => {
      const next = value.replace(/[^0-9]/g, '').slice(0, 4)
      setProblemsState(next)
      problemsRef.current = next
      persist()
    },
    [persist],
  )

  const pushDigit = useCallback(
    (digit: string) => {
      const next = problemsRef.current.length >= 4 ? problemsRef.current : `${problemsRef.current}${digit}`
      setProblemsState(next)
      problemsRef.current = next
      persist()
    },
    [persist],
  )

  const popDigit = useCallback(() => {
    const next = problemsRef.current.slice(0, -1)
    setProblemsState(next)
    problemsRef.current = next
    persist()
  }, [persist])

  const updateItem = useCallback((key: string, patch: Partial<HomeworkPhotoItem>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
    itemsRef.current = itemsRef.current.map((item) => (item.key === key ? { ...item, ...patch } : item))
  }, [])

  /* ── 못 올린 사진을 차례로 (동시에 여러 장 열지 않는다) ──────────── */
  const pump = useCallback(async () => {
    if (!mountedRef.current || pumpingRef.current) return
    pumpingRef.current = true
    setUploading(true)
    try {
      for (;;) {
        const next = itemsRef.current.find(
          (item) => Boolean(item.blob) && !item.path && !inFlightRef.current.has(item.key),
        )
        if (!next) break
        inFlightRef.current.add(next.key)
        updateItem(next.key, { state: 'uploading', error: null })
        const index = Math.max(0, itemsRef.current.findIndex((entry) => entry.key === next.key))
        const res = await homeworkApi.uploadHomeworkPhoto({
          studentId,
          scopeId: sessionId ?? submissionId ?? 'draft',
          index,
          blob: next.blob as Blob,
          name: next.name,
        })
        inFlightRef.current.delete(next.key)
        if (!mountedRef.current) return
        if (!res.ok) {
          updateItem(next.key, { state: 'error', error: res.error })
          setError(res.error)
          break
        }
        updateItem(next.key, { state: 'ready', path: res.data, error: null, blob: null })
        setError(null)
        persist({ force: true })
      }
    } finally {
      pumpingRef.current = false
      if (mountedRef.current) setUploading(false)
    }
  }, [updateItem, studentId, sessionId, submissionId, persist])

  /* ── 사진 고르기 — 한 장씩 줄이고 바로 올린다 ────────────────────── */
  const addFiles = useCallback(
    async (files: File[]) => {
      const picked = (files ?? []).filter(isPhotoFile)
      if (picked.length === 0) return
      const room = Math.max(0, HOMEWORK_PHOTO_MAX - itemsRef.current.length)
      if (room === 0) {
        setError(`사진은 ${HOMEWORK_PHOTO_MAX}장까지 올릴 수 있어요.`)
        return
      }
      const accepted = picked.slice(0, room)
      if (picked.length > room) setError(`사진은 ${HOMEWORK_PHOTO_MAX}장까지라서 ${room}장만 담았어요.`)
      else setError(null)

      for (const file of accepted) {
        let blob: Blob
        let preview: string | null = null
        try {
          const prepared = await homeworkApi.prepareHomeworkPhoto(file)
          blob = prepared.blob
          // 미리 보기는 원본(수 MB)이 아니라 줄인 사진으로 — 화면이 원본을 다시 열지 않게
          preview = typeof URL !== 'undefined' ? URL.createObjectURL(blob) : null
        } catch {
          setError('사진을 준비하지 못했어요. 다시 찍어 올려 주세요.')
          continue
        }
        if (!mountedRef.current) {
          if (preview) URL.revokeObjectURL(preview)
          return
        }
        const item = newPhotoItem({ name: file.name || '숙제 사진', blob, preview, state: 'uploading' })
        setItems((prev) => [...prev, item])
        itemsRef.current = [...itemsRef.current, item]
        void pump()
      }
    },
    [pump],
  )

  const remove = useCallback(
    (key: string) => {
      const target = itemsRef.current.find((item) => item.key === key)
      if (!target) return
      if (target.preview && target.preview.startsWith('blob:')) URL.revokeObjectURL(target.preview)
      setItems((prev) => prev.filter((item) => item.key !== key))
      itemsRef.current = itemsRef.current.filter((item) => item.key !== key)
      inFlightRef.current.delete(key)
      setError(null)
      persist({ force: true })
      if (target.path) void homeworkApi.removeHomeworkPhotos([target.path])
    },
    [persist],
  )

  const begin = useCallback(() => {
    openRef.current = true
    persist({ open: true, force: true })
  }, [persist])

  const leave = useCallback(() => {
    openRef.current = false
    persist({ open: false, force: true })
  }, [persist])

  const flush = useCallback(async (): Promise<{ ok: boolean; paths: string[]; error?: string }> => {
    await pump()
    /* 다른 곳에서 올리던 사진이 아직 있으면 끝날 때까지 잠깐 기다린다(실패한 사진은 기다리지 않는다) */
    for (let i = 0; i < 50; i += 1) {
      const waiting = itemsRef.current.some((item) => Boolean(item.blob) && !item.path && item.state !== 'error')
      if (!waiting) break
      await new Promise((resolve) => setTimeout(resolve, 200))
      await pump()
    }
    const still = itemsRef.current.find((item) => Boolean(item.blob) && !item.path)
    if (still) {
      return { ok: false, paths: [], error: still.error ?? '사진을 올리지 못했어요. 다시 시도해 주세요.' }
    }
    const paths = photoPathsOf(itemsRef.current)
    persist({ force: true })
    return { ok: true, paths }
  }, [persist, pump])

  const reset = useCallback(() => {
    for (const item of itemsRef.current) {
      if (item.preview && item.preview.startsWith('blob:')) URL.revokeObjectURL(item.preview)
    }
    setItems([])
    itemsRef.current = []
    setProblemsState('')
    problemsRef.current = ''
    setReopen(false)
    lastSavedRef.current = ''
    openRef.current = false
    inFlightRef.current = new Set()
    setError(null)
  }, [])

  const discard = useCallback(async () => {
    const paths = photoPathsOf(itemsRef.current)
    openRef.current = false
    lastSavedRef.current = ''
    if (targeted) {
      const res = await homeworkApi.clearHomeworkDraft({
        sessionId: sessionId ?? null,
        submissionId: submissionId ?? null,
      })
      if (!res.ok) console.warn('[sunogong] 숙제 초안 지우기 실패:', res.error)
    }
    if (paths.length > 0) await homeworkApi.removeHomeworkPhotos(paths)
    reset()
  }, [reset, sessionId, submissionId, targeted])

  return {
    items,
    problems,
    loading,
    uploading,
    error,
    reopen,
    clearReopen: () => setReopen(false),
    pushDigit,
    popDigit,
    setProblems,
    addFiles,
    remove,
    begin,
    leave,
    flush,
    reset,
    discard,
  }
}
