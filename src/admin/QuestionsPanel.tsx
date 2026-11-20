import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImageViewer } from '../components/ImageViewer'
import { Spinner } from '../components/Keypad'
import { Modal } from '../components/Modal'
import * as questionsApi from '../lib/questions'
import {
  ANSWER_MEDIA_ACCEPT,
  answerStateLabel,
  countUnanswered,
  filterQuestions,
  formatQuestionTime,
  isAnswered,
  mediaKindFromPath,
  mediaKindOfFile,
  normalizeAnswer,
  parseAutoCleanup,
  QUESTION_ANSWER_MAX,
  QUESTION_FILTER_LABEL,
  QUESTION_RETENTION_DAYS,
  questionStudent,
  retentionLabel,
  sortQuestionsForAdmin,
  validateAnswerMedia,
  type MediaKind,
  type QuestionFilter,
} from '../lib/questionBoard'
import type { StudyQuestion } from '../lib/types'
import { AdminSection, EmptyBlock, ErrorBlock, LoadingBlock } from './ui'

const STORAGE_KEY = 'sunogong.questions-auto-cleanup'
/** 자동 정리를 너무 자주 하지 않게 (같은 페이지에서 질문함을 오갈 때) */
const AUTO_CLEANUP_MIN_GAP_MS = 10 * 60 * 1000
let lastAutoCleanupMs = 0

function readAutoCleanup(): boolean {
  try {
    return parseAutoCleanup(localStorage.getItem(STORAGE_KEY))
  } catch {
    return true
  }
}

interface EditorState {
  question: StudyQuestion
  answer: string
  file: File | null
  fileKind: MediaKind | null
  removeMedia: boolean
}

interface QuestionsPanelProps {
  /** 답변 대기 수가 바뀌면 상단 탭 배지를 갱신한다 */
  onUnansweredChange?: (count: number) => void
}

/** 관리자 '질문함' — 학생 질문에 선오공이 답변(글 + 사진/동영상)을 달고, 오래된 질문을 정리한다 */
export function QuestionsPanel({ onUnansweredChange }: QuestionsPanelProps): JSX.Element {
  const [questions, setQuestions] = useState<StudyQuestion[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<QuestionFilter>('waiting')
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [editorBusy, setEditorBusy] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<StudyQuestion | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [cleanupCount, setCleanupCount] = useState<number | null>(null)
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [cleanupBusy, setCleanupBusy] = useState(false)
  const [autoCleanup, setAutoCleanup] = useState(readAutoCleanup)
  const [toast, setToast] = useState<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await questionsApi.listAllQuestions()
    if (res.ok) {
      const list = sortQuestionsForAdmin(res.data ?? [])
      setQuestions(list)
      setError(null)
      onUnansweredChange?.(countUnanswered(list))
      void questionsApi.signQuestionImages(list).then(setUrls)
    } else {
      setError(res.error)
      setQuestions([])
    }
    setLoading(false)
  }, [onUnansweredChange])

  const refreshCleanupCount = useCallback(async () => {
    const res = await questionsApi.countQuestionsToCleanup(QUESTION_RETENTION_DAYS)
    setCleanupCount(res.ok ? res.data : null)
  }, [])

  useEffect(() => {
    void load()
    void refreshCleanupCount()
  }, [load, refreshCleanupCount])

  /* 새로 고른 파일 미리 보기 주소 */
  useEffect(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    if (!editor?.file) {
      setPreviewUrl(null)
      return undefined
    }
    const url = URL.createObjectURL(editor.file)
    previewUrlRef.current = url
    setPreviewUrl(url)
    return () => {
      URL.revokeObjectURL(url)
      if (previewUrlRef.current === url) previewUrlRef.current = null
    }
  }, [editor?.file])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 5000)
  }

  const openEditor = (question: StudyQuestion) => {
    setEditor({
      question,
      answer: question.answer ?? '',
      file: null,
      fileKind: null,
      removeMedia: false,
    })
    setEditorError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const closeEditor = () => {
    if (editorBusy) return
    setEditor(null)
    setEditorError(null)
  }

  const saveAnswer = async () => {
    if (!editor || editorBusy) return
    const answer = normalizeAnswer(editor.answer)
    const keepsExistingMedia = Boolean(editor.question.answer_media_path) && !editor.removeMedia && !editor.file
    if (!answer && !editor.file && !keepsExistingMedia) {
      setEditorError('답변 글을 쓰거나 해설지 사진·영상을 올려 주세요.')
      return
    }
    setEditorBusy(true)
    setEditorError(null)
    const res = await questionsApi.answerQuestion(editor.question.id, {
      answer,
      mediaFile: editor.file,
      currentMediaPath: editor.question.answer_media_path,
      removeMedia: editor.removeMedia,
    })
    if (!res.ok) {
      setEditorError(res.error)
      setEditorBusy(false)
      return
    }
    const saved = res.data
    setQuestions((prev) => sortQuestionsForAdmin(prev.map((item) => (item.id === saved.id ? saved : item))))
    void questionsApi
      .signQuestionMedia([saved.answer_media_path])
      .then((signed) => setUrls((prev) => ({ ...prev, ...signed })))
    setEditorBusy(false)
    setEditor(null)
    showToast('답변을 저장했어요. 학생 홈에 새 답변으로 표시돼요.')
  }

  const removeQuestion = async () => {
    if (!deleting || deleteBusy) return
    setDeleteBusy(true)
    const res = await questionsApi.deleteQuestion(deleting)
    setDeleteBusy(false)
    if (!res.ok) {
      showToast(res.error)
      return
    }
    setQuestions((prev) => {
      const next = prev.filter((item) => item.id !== deleting.id)
      onUnansweredChange?.(countUnanswered(next))
      return next
    })
    setDeleting(null)
    showToast('질문을 삭제했어요. 사진·영상도 함께 지웠어요.')
    void refreshCleanupCount()
  }

  const runCleanup = useCallback(
    async (silent: boolean) => {
      if (!silent) setCleanupBusy(true)
      const res = await questionsApi.cleanupOldQuestions(QUESTION_RETENTION_DAYS)
      if (!silent) setCleanupBusy(false)
      if (!res.ok) {
        if (!silent) showToast(res.error)
        return
      }
      const { questions: removedQuestions, files, failedFiles } = res.data
      if (removedQuestions > 0) {
        showToast(
          `오래된 질문 ${removedQuestions}개와 사진·영상 ${files}개를 정리했어요.${
            failedFiles > 0 ? ` (파일 ${failedFiles}개는 지우지 못했어요)` : ''
          }`,
        )
        void load()
        if (!silent) setCleanupOpen(false)
      } else if (!silent) {
        showToast('정리할 질문이 없어요.')
        setCleanupOpen(false)
      }
      void refreshCleanupCount()
    },
    [load, refreshCleanupCount],
  )

  /* 질문함을 열 때 오래된 질문을 조용히 자동 정리 (설정이 켜져 있을 때) */
  useEffect(() => {
    if (!autoCleanup) return
    if (Date.now() - lastAutoCleanupMs < AUTO_CLEANUP_MIN_GAP_MS) return
    lastAutoCleanupMs = Date.now()
    void runCleanup(true)
  }, [autoCleanup, runCleanup])

  const toggleAutoCleanup = () => {
    const next = !autoCleanup
    setAutoCleanup(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
    } catch {
      /* 저장 실패해도 이번 화면에서는 적용 */
    }
    if (next) {
      lastAutoCleanupMs = 0
      void runCleanup(true)
    }
  }

  const waiting = useMemo(() => questions.filter((question) => !isAnswered(question)).length, [questions])
  const answered = questions.length - waiting
  const visible = useMemo(() => filterQuestions(questions, filter), [questions, filter])

  const editorExistingMediaUrl = editor?.question.answer_media_path
    ? urls[editor.question.answer_media_path]
    : undefined
  const editorMediaKind: MediaKind | null = editor?.file
    ? editor.fileKind
    : editor && !editor.removeMedia
      ? mediaKindFromPath(editor.question.answer_media_path)
      : null
  const editorMediaUrl = editor?.file ? previewUrl : editor && !editor.removeMedia ? editorExistingMediaUrl : null

  return (
    <div className="space-y-3">
      <AdminSection
        title="선오공에게 온 질문"
        description="학생이 올린 문제 사진에 선오공이(선생님)가 답합니다. 답변에는 해설지 사진이나 훈노트 영상(50MB 이하)을 붙일 수 있어요."
        actions={
          <button type="button" className="btn-ghost border border-blue-line text-[12px]" onClick={() => void load()}>
            새로고침
          </button>
        }
      >
        <div className="rounded-2xl border border-blue-line bg-blue-soft/50 px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12.5px] font-bold text-navy">오래된 질문 자동 정리</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-navy/50">
                {retentionLabel(QUESTION_RETENTION_DAYS)}. 질문함을 열 때 자동으로 지워서 Supabase 무료 용량(1GB)을
                넘지 않게 관리해요.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoCleanup}
              aria-label="오래된 질문 자동 정리"
              onClick={toggleAutoCleanup}
              className={`mt-0.5 flex h-7 w-12 shrink-0 items-center rounded-full px-1 transition ${
                autoCleanup ? 'bg-navy' : 'bg-navy/20'
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white shadow transition ${autoCleanup ? 'translate-x-5' : ''}`}
              />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-navy/60 tabular">
              지금 정리할 질문 {cleanupCount === null ? '—' : `${cleanupCount}개`}
            </span>
            <button
              type="button"
              onClick={() => setCleanupOpen(true)}
              disabled={cleanupCount === null}
              className="rounded-full border border-navy/15 bg-white px-3 py-1 text-[11px] font-bold text-navy/70 transition hover:bg-blue-soft disabled:opacity-40"
            >
              지금 정리
            </button>
            <button
              type="button"
              onClick={() => {
                void refreshCleanupCount()
                void load()
              }}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-navy/45 hover:bg-white"
            >
              숫자 새로고침
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(['waiting', 'answered', 'all'] as QuestionFilter[]).map((key) => {
            const count = key === 'waiting' ? waiting : key === 'answered' ? answered : questions.length
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={`rounded-full px-3.5 py-1.5 text-[12px] font-bold transition ${
                  filter === key ? 'bg-navy text-white shadow-soft' : 'bg-blue-soft/70 text-navy/55 hover:bg-blue-soft'
                }`}
              >
                {QUESTION_FILTER_LABEL[key]} <span className="tabular">{count}</span>
              </button>
            )
          })}
        </div>

        {error ? (
          <div className="mt-3">
            <ErrorBlock message={error} onRetry={() => void load()} />
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
              질문 표가 아직 없으면 Supabase 대시보드 → SQL Editor 에서{' '}
              <code>supabase/migrate-2026-11-21-questions.sql</code> 을 한 번 실행해 주세요.
            </p>
          </div>
        ) : loading ? (
          <div className="mt-4">
            <LoadingBlock label="질문을 불러오는 중…" />
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-3">
            <EmptyBlock
              message={
                filter === 'waiting' ? '답변을 기다리는 질문이 없어요.' : filter === 'answered' ? '답변한 질문이 없어요.' : '아직 온 질문이 없어요.'
              }
            />
          </div>
        ) : (
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {visible.map((question) => {
              const student = questionStudent(question)
              const answeredNow = isAnswered(question)
              const photoUrl = urls[question.image_path]
              const answerMediaUrl = question.answer_media_path ? urls[question.answer_media_path] : undefined
              const answerMediaKind = mediaKindFromPath(question.answer_media_path)
              return (
                <li key={question.id} className="overflow-hidden rounded-2xl border border-blue-line bg-white shadow-card">
                  <div className="flex items-start justify-between gap-2 px-3.5 pt-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-navy">
                        {student.name}
                        {student.grade ? <span className="ml-1 text-[11px] font-semibold text-navy/45">{student.grade}</span> : null}
                      </p>
                      <p className="mt-0.5 text-[10.5px] font-semibold text-navy/40">
                        {formatQuestionTime(question.created_at)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        answeredNow ? 'bg-[#EDE4FF] text-[#4A28A0]' : 'bg-red-50 text-red-500'
                      }`}
                    >
                      {answerStateLabel(question)}
                    </span>
                  </div>

                  <div className="mt-2 px-3.5">
                    <button
                      type="button"
                      onClick={() => photoUrl && setLightbox({ src: photoUrl, alt: `${student.name} 문제 사진` })}
                      disabled={!photoUrl}
                      className="block w-full"
                      aria-label="질문 사진 크게 보기"
                    >
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt={`${student.name} 문제 사진`}
                          loading="lazy"
                          className="max-h-[220px] w-full rounded-xl bg-blue-soft object-contain"
                        />
                      ) : (
                        <span className="flex h-28 w-full items-center justify-center rounded-xl bg-blue-soft text-[11px] font-semibold text-navy/30">
                          사진 불러오는 중…
                        </span>
                      )}
                    </button>
                  </div>

                  {question.memo ? (
                    <p className="mt-2 whitespace-pre-wrap px-3.5 text-[13px] font-semibold leading-snug text-navy">
                      {question.memo}
                    </p>
                  ) : null}

                  {answeredNow ? (
                    <div className="mx-3 mt-2 rounded-xl bg-[#F5F0FF] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-bold text-[#4A28A0]">{question.answered_by || '선오공이'} 답변</p>
                        <p className="text-[10px] font-semibold text-[#4A28A0]/45">
                          {formatQuestionTime(question.answered_at)}
                        </p>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-navy">{question.answer}</p>
                      {question.answer_media_path ? (
                        answerMediaUrl ? (
                          answerMediaKind === 'video' ? (
                            <video
                              src={answerMediaUrl}
                              controls
                              playsInline
                              preload="metadata"
                              className="mt-2 max-h-[260px] w-full rounded-lg bg-black"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setLightbox({ src: answerMediaUrl, alt: `${student.name} 풀이 사진` })
                              }
                              className="mt-2 block w-full"
                            >
                              <img
                                src={answerMediaUrl}
                                alt="풀이 사진"
                                loading="lazy"
                                className="max-h-[240px] w-full rounded-lg bg-white object-contain"
                              />
                            </button>
                          )
                        ) : (
                          <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-[11px] font-semibold text-navy/35">
                            첨부 사진·영상을 불러오는 중…
                          </p>
                        )
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-2 flex flex-wrap items-center gap-1.5 px-3.5 pb-3">
                    <button
                      type="button"
                      onClick={() => openEditor(question)}
                      className={`rounded-xl px-3 py-1.5 text-[11.5px] font-bold transition ${
                        answeredNow ? 'border border-blue-line bg-white text-navy/70' : 'bg-navy text-white'
                      }`}
                    >
                      {answeredNow ? '답변 수정' : '답변 달기'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(question)}
                      className="rounded-xl px-2.5 py-1.5 text-[11.5px] font-bold text-red-500/80 hover:bg-red-50"
                    >
                      삭제
                    </button>
                    {question.answer_media_path ? (
                      <span className="ml-auto rounded-full bg-blue-soft px-2 py-0.5 text-[10px] font-bold text-navy/50">
                        {mediaKindFromPath(question.answer_media_path) === 'video' ? '🎬 동영상' : '🖼️ 사진'}
                      </span>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </AdminSection>

      {/* 답변 작성/수정 */}
      <Modal
        open={Boolean(editor)}
        title={editor && isAnswered(editor.question) ? '답변 수정' : '선오공이 답변 달기'}
        description={
          editor
            ? `${questionStudent(editor.question).name} 학생 · ${formatQuestionTime(editor.question.created_at)}`
            : undefined
        }
        onClose={closeEditor}
        wide
        footer={
          <>
            <button type="button" className="btn-outline" onClick={closeEditor} disabled={editorBusy}>
              취소
            </button>
            <button type="button" className="btn-navy" onClick={() => void saveAnswer()} disabled={editorBusy}>
              {editorBusy ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="h-5 w-5 border-white/40 border-t-white" />
                  {editor?.file && mediaKindOfFile(editor.file) === 'video' ? '영상 올리는 중…' : '저장 중…'}
                </span>
              ) : (
                '답변 저장'
              )}
            </button>
          </>
        }
      >
        {editor ? (
          <div className="space-y-3">
            <div className="flex gap-3 rounded-2xl bg-blue-soft/60 p-2.5">
              {urls[editor.question.image_path] ? (
                <button
                  type="button"
                  onClick={() =>
                    setLightbox({
                      src: urls[editor.question.image_path],
                      alt: `${questionStudent(editor.question).name} 문제 사진`,
                    })
                  }
                  className="shrink-0"
                >
                  <img
                    src={urls[editor.question.image_path]}
                    alt="질문 문제 사진"
                    className="h-20 w-20 rounded-xl bg-white object-cover"
                  />
                </button>
              ) : (
                <div className="h-20 w-20 shrink-0 rounded-xl bg-white" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-navy">{questionStudent(editor.question).name} 학생의 질문</p>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] font-semibold text-navy/65">
                  {editor.question.memo || '(메모 없이 사진만 올렸어요)'}
                </p>
              </div>
            </div>

            <label className="block">
              <span className="text-[12px] font-bold text-navy/60">답변 글</span>
              <textarea
                value={editor.answer}
                onChange={(event) => setEditor((prev) => (prev ? { ...prev, answer: event.target.value } : prev))}
                rows={5}
                maxLength={QUESTION_ANSWER_MAX}
                placeholder="예) 3번은 분모를 먼저 통분하면 돼요. 아래 풀이 사진을 봐요!"
                className="mt-1 w-full resize-y rounded-xl border border-blue-line bg-white px-3 py-2.5 text-[13.5px] leading-relaxed text-navy placeholder:text-navy/30 focus:outline-none focus:ring-2 focus:ring-blue-brand/30"
              />
              <span className="mt-1 block text-right text-[10px] font-semibold text-navy/35">
                {editor.answer.length}/{QUESTION_ANSWER_MAX}
              </span>
            </label>

            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-navy/60">해설지 사진 · 훈노트 영상 (선택)</span>
                <span className="text-[10px] font-semibold text-navy/40">50MB 이하</span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={ANSWER_MEDIA_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  if (!file) return
                  const invalid = validateAnswerMedia(file)
                  if (invalid) {
                    setEditorError(invalid)
                    if (fileRef.current) fileRef.current.value = ''
                    return
                  }
                  setEditorError(null)
                  setEditor((prev) =>
                    prev ? { ...prev, file, fileKind: mediaKindOfFile(file), removeMedia: false } : prev,
                  )
                }}
              />

              {editorMediaUrl ? (
                <div className="mt-1.5 rounded-2xl border border-blue-line bg-white p-2">
                  {editorMediaKind === 'video' ? (
                    <video src={editorMediaUrl} controls playsInline className="max-h-[240px] w-full rounded-lg bg-black" />
                  ) : (
                    <img src={editorMediaUrl} alt="답변에 붙일 사진" className="max-h-[220px] w-full rounded-lg object-contain" />
                  )}
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-[10.5px] font-semibold text-navy/45">
                      {editor.file
                        ? editor.file.name
                        : mediaKindFromPath(editor.question.answer_media_path) === 'video'
                          ? '지금 붙어 있는 동영상'
                          : '지금 붙어 있는 사진'}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="rounded-lg border border-blue-line px-2.5 py-1 text-[10.5px] font-bold text-navy/65"
                      >
                        바꾸기
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditor((prev) => (prev ? { ...prev, file: null, fileKind: null, removeMedia: true } : prev))
                          if (fileRef.current) fileRef.current.value = ''
                        }}
                        className="rounded-lg bg-navy/80 px-2.5 py-1 text-[10.5px] font-bold text-white"
                      >
                        빼기
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="mt-1.5 flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-blue-line bg-blue-soft/40 px-3 py-4 text-[11.5px] font-bold text-navy/55 transition hover:bg-blue-soft"
                >
                  <span className="text-[18px]" aria-hidden="true">📷 🎬</span>
                  해설지 사진 찍기 · 훈노트 영상 올리기
                  <span className="text-[10px] font-semibold text-navy/35">사진(JPG·PNG) 또는 영상(MP4·WebM·MOV)</span>
                </button>
              )}
            </div>

            {editorError ? (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-500">{editorError}</div>
            ) : null}

            <p className="rounded-xl bg-[#F5F0FF] px-3 py-2 text-[11px] leading-relaxed text-[#4A28A0]/80">
              저장하면 학생 홈의 <strong>선오공에게 질문하기</strong>에 <strong>새 답변</strong> 배지가 뜨고, 답변 완료
              7일 뒤에는 질문 사진·영상과 함께 자동으로 정리돼요.
            </p>
          </div>
        ) : null}
      </Modal>

      {/* 삭제 확인 */}
      <Modal
        open={Boolean(deleting)}
        title="질문을 삭제할까요?"
        description={
          deleting
            ? `${questionStudent(deleting).name} 학생의 질문과 사진·영상이 함께 지워지고, 되돌릴 수 없어요.`
            : undefined
        }
        onClose={() => (deleteBusy ? undefined : setDeleting(null))}
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              취소
            </button>
            <button
              type="button"
              onClick={() => void removeQuestion()}
              disabled={deleteBusy}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-500 px-5 py-3 font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {deleteBusy ? <Spinner className="h-5 w-5 border-white/40 border-t-white" /> : '삭제'}
            </button>
          </>
        }
      />

      {/* 오래된 질문 정리 확인 */}
      <Modal
        open={cleanupOpen}
        title="오래된 질문을 정리할까요?"
        description={`답변 완료 후 ${QUESTION_RETENTION_DAYS}일이 지난 질문 ${cleanupCount ?? 0}개를 사진·영상과 함께 지워요. 되돌릴 수 없어요.`}
        onClose={() => (cleanupBusy ? undefined : setCleanupOpen(false))}
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setCleanupOpen(false)} disabled={cleanupBusy}>
              취소
            </button>
            <button type="button" className="btn-navy" onClick={() => void runCleanup(false)} disabled={cleanupBusy}>
              {cleanupBusy ? <Spinner className="h-5 w-5 border-white/40 border-t-white" /> : '정리하기'}
            </button>
          </>
        }
      >
        <p className="rounded-2xl bg-blue-soft/60 px-3 py-2.5 text-[12px] leading-relaxed text-navy/60">
          질문 글과 함께 Storage 에 올라간 사진·영상 파일까지 지워서 실제 저장 용량이 비워져요. 답변을 달지 않은
          질문은 그대로 둡니다.
        </p>
      </Modal>

      {lightbox ? (
        <ImageViewer src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      ) : null}

      {toast ? (
        <div className="fixed inset-x-3 bottom-4 z-50 mx-auto flex max-w-lg items-center gap-2 rounded-2xl bg-navy px-4 py-3 text-[12px] font-semibold text-white shadow-lg">
          <span className="flex-1 break-words">{toast}</span>
          <button type="button" className="shrink-0 underline" onClick={() => setToast(null)}>
            닫기
          </button>
        </div>
      ) : null}
    </div>
  )
}
