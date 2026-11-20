import { useCallback, useEffect, useState } from 'react'
import { BrandFooter, Mascot } from '../components/Brand'
import { ImageViewer } from '../components/ImageViewer'
import { Spinner } from '../components/Keypad'
import * as questionsApi from '../lib/questions'
import {
  answerStateLabel,
  formatQuestionTime,
  isAnswered,
  isUnreadAnswer,
  mediaKindFromPath,
} from '../lib/questionBoard'
import type { Student, StudyQuestion } from '../lib/types'
import { QuestionAskForm } from './QuestionAskForm'

interface QuestionBoardScreenProps {
  student: Student
  onBack: () => void
  /** 새 답변 배지 숫자가 바뀌면 알려 준다 (홈 화면 배지) */
  onUnreadChange?: (count: number) => void
}

/**
 * 학생용 '선오공에게 질문하기' 화면.
 * 문제 사진을 올리고, 내가 올린 질문 카드와 선오공이의 답변(사진·영상 포함)을 본다.
 */
export function QuestionBoardScreen({ student, onBack, onUnreadChange }: QuestionBoardScreenProps): JSX.Element {
  const [questions, setQuestions] = useState<StudyQuestion[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  /** 이번에 처음 열린 '새 답변' — 답변 완료 배지 옆에 잠깐 표시한다 */
  const [newlyRead, setNewlyRead] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await questionsApi.listStudentQuestions(student.id)
    if (!res.ok) {
      setError(res.error)
      setQuestions([])
      setLoading(false)
      return
    }
    const list = res.data ?? []
    setQuestions(list)
    setError(null)
    setLoading(false)
    void questionsApi.signQuestionImages(list).then(setUrls)

    // 답변을 열었으니 '새 답변' 배지를 지운다
    const unread = list.filter(isUnreadAnswer).map((question) => question.id)
    setNewlyRead(unread)
    onUnreadChange?.(0)
    if (unread.length > 0) {
      const marked = await questionsApi.markAnswersRead(unread)
      if (!marked.ok) console.warn('[sunogong] 답변 읽음 표시 실패:', marked.error)
    }
  }, [student.id, onUnreadChange])

  useEffect(() => {
    void load()
  }, [load])

  const handleSubmitted = (question: StudyQuestion) => {
    setQuestions((prev) => [question, ...prev])
    setNewlyRead([])
    void questionsApi
      .signQuestionMedia([question.image_path])
      .then((signed) => setUrls((prev) => ({ ...prev, ...signed })))
  }

  const answeredCount = questions.filter(isAnswered).length
  const waitingCount = questions.length - answeredCount

  return (
    <div className="screen bg-gradient-to-b from-blue-soft/70 to-white">
      <header className="sticky top-0 z-20 border-b border-blue-line/70 bg-white/95 px-4 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="뒤로"
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-navy/60 transition hover:bg-blue-soft"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Mascot variant="face" className="h-8 w-8" />
          <div className="min-w-0 flex-1">
            <h1 className="font-round text-[19px] font-extrabold leading-none text-navy">선오공에게 질문하기</h1>
            <p className="mt-1 text-[11px] font-semibold text-navy/45">
              {student.name} · 문제 사진을 올리면 선오공이가 답해줘요
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 px-4 pb-2 pt-3">
        <section className="card">
          <h2 className="text-[15px] font-bold text-navy">새 질문 올리기</h2>
          <p className="mt-1 text-[12px] font-semibold text-navy/45">
            모르는 문제를 사진으로 찍어 올려 주세요. 한 줄로 어디서 막혔는지 적으면 더 좋아요.
          </p>
          <div className="mt-3">
            <QuestionAskForm studentId={student.id} onSubmitted={handleSubmitted} compact />
          </div>
        </section>

        <section className="mt-5">
          <div className="flex items-end justify-between gap-2 px-1">
            <h2 className="text-[15px] font-bold text-navy">내 질문</h2>
            <p className="text-[11px] font-semibold text-navy/45 tabular">
              답변 완료 {answeredCount} · 답변 대기 {waitingCount}
            </p>
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner className="h-6 w-6 border-navy/20 border-t-navy" />
            </div>
          ) : error ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-red-50 px-3 py-3 text-[12px] text-red-500">
              <span className="break-words">{error}</span>
              <button type="button" className="shrink-0 font-bold underline" onClick={() => void load()}>
                다시
              </button>
            </div>
          ) : questions.length === 0 ? (
            <div className="mt-3 rounded-3xl border border-blue-line bg-white px-4 py-8 text-center">
              <p className="text-[13px] font-semibold text-navy/45">아직 올린 질문이 없어요.</p>
              <p className="mt-1 text-[12px] text-navy/35">위에서 문제 사진을 찍어 첫 질문을 올려 보세요!</p>
            </div>
          ) : (
            <ul className="mt-3 space-y-3">
              {questions.map((question) => {
                const answered = isAnswered(question)
                const photoUrl = urls[question.image_path]
                const answerMediaUrl = question.answer_media_path ? urls[question.answer_media_path] : undefined
                const answerMediaKind = mediaKindFromPath(question.answer_media_path)
                return (
                  <li key={question.id} className="overflow-hidden rounded-3xl border border-blue-line bg-white shadow-card">
                    <div className="flex items-center justify-between gap-2 px-4 pt-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            answered ? 'bg-[#EDE4FF] text-[#4A28A0]' : 'bg-blue-soft text-navy/50'
                          }`}
                        >
                          {answerStateLabel(question)}
                        </span>
                        {newlyRead.includes(question.id) ? (
                          <span className="rounded-full bg-red-500 px-2 py-1 text-[10px] font-bold text-white">새 답변</span>
                        ) : null}
                      </div>
                      <span className="text-[11px] font-semibold text-navy/40">
                        {formatQuestionTime(question.created_at)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => photoUrl && setLightbox(photoUrl)}
                      disabled={!photoUrl}
                      className="mt-2 block w-full px-4 text-left"
                      aria-label="문제 사진 크게 보기"
                    >
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt="내가 올린 문제 사진"
                          loading="lazy"
                          className="max-h-[280px] w-full rounded-2xl bg-blue-soft object-contain"
                        />
                      ) : (
                        <span className="flex h-32 w-full items-center justify-center rounded-2xl bg-blue-soft text-[12px] font-semibold text-navy/30">
                          사진 불러오는 중…
                        </span>
                      )}
                    </button>

                    {question.memo ? (
                      <p className="whitespace-pre-wrap px-4 pb-3 pt-2 text-[14px] font-semibold leading-snug text-navy">
                        {question.memo}
                      </p>
                    ) : (
                      <div className="pb-1" />
                    )}

                    {answered ? (
                      <div className="mx-3 mb-3 rounded-2xl bg-[#F5F0FF] p-3.5">
                        <div className="flex items-center gap-1.5">
                          <Mascot variant="face" className="h-5 w-5" />
                          <p className="text-[12px] font-bold text-[#4A28A0]">선오공이</p>
                          <span className="ml-auto text-[10px] font-semibold text-[#4A28A0]/50">
                            {formatQuestionTime(question.answered_at)}
                          </span>
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-navy">
                          {question.answer}
                        </p>
                        {question.answer_media_path ? (
                          answerMediaUrl ? (
                            answerMediaKind === 'video' ? (
                              <video
                                src={answerMediaUrl}
                                controls
                                playsInline
                                preload="metadata"
                                className="mt-2.5 max-h-[320px] w-full rounded-xl bg-black"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setLightbox(answerMediaUrl)}
                                className="mt-2.5 block w-full"
                                aria-label="풀이 사진 크게 보기"
                              >
                                <img
                                  src={answerMediaUrl}
                                  alt="선오공이의 풀이 사진"
                                  loading="lazy"
                                  className="max-h-[300px] w-full rounded-xl bg-white object-contain"
                                />
                              </button>
                            )
                          ) : (
                            <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-[11px] font-semibold text-navy/35">
                              풀이 사진·영상을 불러오는 중…
                            </p>
                          )
                        ) : null}
                      </div>
                    ) : (
                      <p className="px-4 pb-3.5 text-[12px] font-semibold text-navy/35">
                        선오공이가 확인하고 있어요. 조금만 기다려 주세요!
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <BrandFooter />
      <ImageViewer src={lightbox} alt="문제 사진" onClose={() => setLightbox(null)} />
    </div>
  )
}
