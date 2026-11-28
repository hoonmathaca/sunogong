import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { PhotoPager } from '../components/PhotoPager'
import { Spinner } from '../components/Keypad'
import * as homeworkApi from '../lib/homework'
import {
  HOMEWORK_FILTER_LABEL,
  HOMEWORK_REASON_MAX,
  HOMEWORK_REJECT_CHIPS,
  approvedLine,
  countPending,
  filterSubmissions,
  formatSubmissionTime,
  hasRejectedPart,
  isReviewed,
  nextPendingSubmission,
  normalizeComment,
  normalizeReason,
  photoCount,
  rereviewNotice,
  reviewDefaults,
  reviewEditResultText,
  reviewResultText,
  sortSubmissionsForAdmin,
  studyWindowText,
  submissionStatusLabel,
  submissionStudent,
  submissionSummary,
  teacherCommentText,
  toggleChip,
} from '../lib/homeworkBoard'
import type { HomeworkFilter } from '../lib/homeworkBoard'
import type { HomeworkSubmission } from '../lib/types'
import { PraiseEditor } from './PraiseEditor'
import { AdminSection, EmptyBlock, ErrorBlock, LoadingBlock } from './ui'

interface HomeworkPanelProps {
  /** 승인 대기 수가 바뀌면 상단 탭 배지를 갱신한다 */
  onPendingChange?: (count: number) => void
}

const FILTERS: HomeworkFilter[] = ['pending', 'approved', 'rejected', 'all']

interface ReviewState {
  submission: HomeworkSubmission
  timeApproved: boolean
  problemsApproved: boolean
  reason: string
  /** 학생에게 보일 칭찬·응원 한마디 (선택 — 비우면 보내지 않는다) */
  comment: string
}

/**
 * 관리자 「숙제관리」 — 학생이 사진과 함께 낸 숙제 공부를 한 건씩 확인한다.
 * 시간과 문항수를 따로 승인/반려하고, 확인을 누르면 승인한 항목만 그 날 기록에 더해진다.
 */
export function HomeworkPanel({ onPendingChange }: HomeworkPanelProps): JSX.Element {
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<HomeworkFilter>('pending')
  const [review, setReview] = useState<ReviewState | null>(null)
  const [saving, setSaving] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [photoOpen, setPhotoOpen] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await homeworkApi.listHomeworkSubmissions()
    if (res.ok) {
      setSubmissions(res.data ?? [])
      setError(null)
      onPendingChange?.(countPending(res.data ?? []))
    } else {
      setError(res.error)
      setSubmissions([])
    }
    setLoading(false)
  }, [onPendingChange])

  useEffect(() => {
    void load()
  }, [load])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 6000)
  }

  const pendingTotal = useMemo(() => countPending(submissions), [submissions])
  const visible = useMemo(
    () => sortSubmissionsForAdmin(filterSubmissions(submissions, filter), filter),
    [submissions, filter],
  )

  /** 선택한 제출의 사진 주소를 읽어 둔다 (비공개 버킷이라 서명 URL) */
  const openReview = (submission: HomeworkSubmission) => {
    const defaults = reviewDefaults(submission)
    setReview({
      submission,
      timeApproved: defaults.timeApproved,
      problemsApproved: defaults.problemsApproved,
      reason: submission.reject_reason ?? '',
      comment: submission.teacher_comment ?? '',
    })
    setReviewError(null)
    setPhotoOpen(null)
    void homeworkApi.signHomeworkPhotos(submission.photo_paths).then((signed) => {
      setUrls((prev) => ({ ...prev, ...signed }))
    })
  }

  const closeReview = () => {
    if (saving) return
    setReview(null)
    setReviewError(null)
    setPhotoOpen(null)
  }

  const patchReview = (patch: Partial<ReviewState>) => {
    setReview((current) => (current ? { ...current, ...patch } : current))
  }

  const save = async () => {
    if (!review || saving) return
    const { submission, timeApproved, problemsApproved } = review
    /* 이미 확인한 제출을 고치는 경우 — 이전 승인분을 안내 문구에 쓴다 */
    const previous = {
      status: submission.status,
      minutes: submission.approved_minutes ?? 0,
      problems: submission.approved_problems ?? 0,
    }
    setSaving(true)
    setReviewError(null)
    const res = await homeworkApi.reviewHomeworkSubmission(
      submission.id,
      timeApproved,
      problemsApproved,
      normalizeReason(review.reason),
      normalizeComment(review.comment),
    )
    setSaving(false)
    if (!res.ok) {
      setReviewError(res.error)
      return
    }

    const saved = res.data.submission
    const nextList = submissions.map((item) => (item.id === saved.id ? { ...item, ...saved } : item))
    setSubmissions(nextList)
    onPendingChange?.(countPending(nextList))
    showToast(
      previous.status === 'pending'
        ? reviewResultText(saved.status, res.data.minutes, res.data.problems)
        : reviewEditResultText({
            previousStatus: previous.status,
            previousMinutes: previous.minutes,
            previousProblems: previous.problems,
            status: saved.status,
            minutes: res.data.minutes,
            problems: res.data.problems,
          }),
    )

    /* 처리한 뒤에는 다음 대기 학생으로 바로 넘어간다 */
    const next = nextPendingSubmission(nextList, saved.id)
    if (next && filter === 'pending') {
      openReview(next)
    } else {
      setReview(null)
      setPhotoOpen(null)
    }
  }

  const allReject = () => {
    if (!review) return
    patchReview({ timeApproved: false, problemsApproved: false })
  }

  const allApprove = () => {
    if (!review) return
    patchReview({
      timeApproved: true,
      problemsApproved: review.submission.submitted_problems !== null,
    })
  }

  const gaplessPhotos = review ? review.submission.photo_paths : []
  const photoUrls = gaplessPhotos.map((path) => urls[path] ?? '')

  return (
    <div className="space-y-3">
      <AdminSection
        title="숙제 제출 확인"
        description="학생이 공부한 페이지 사진과 함께 낸 숙제 공부예요. 시간과 문항수를 따로 승인/반려하면 승인한 항목만 그 날 기록·랭킹에 들어갑니다. 이미 확인한 제출도 다시 열어 고칠 수 있어요. (드래곤볼과는 별개예요)"
        actions={
          <button type="button" className="btn-ghost border border-blue-line text-[12px]" onClick={() => void load()}>
            새로고침
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((option) => {
            const active = filter === option
            const count =
              option === 'all' ? submissions.length : filterSubmissions(submissions, option).length
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(option)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition ${
                  active ? 'bg-navy text-white shadow-soft' : 'border border-blue-line bg-white text-navy/55'
                }`}
              >
                {HOMEWORK_FILTER_LABEL[option]}
                <span className={`ml-1 tabular ${active ? 'text-white/80' : 'text-navy/40'}`}>{count}</span>
              </button>
            )
          })}
        </div>

        {pendingTotal > 0 ? (
          <div className="mt-2 rounded-2xl border border-[#E9A400]/35 bg-[#FFF6DA] px-3.5 py-2.5 text-[12px] font-semibold text-[#7A5B00]">
            선생님 확인을 기다리는 숙제가 {pendingTotal}건 있어요. 오래된 것부터 한 명씩 확인하면 돼요.
          </div>
        ) : null}

        <div className="mt-3">
          {loading ? (
            <LoadingBlock label="숙제 제출을 불러오는 중…" />
          ) : error ? (
            <ErrorBlock message={error} onRetry={() => void load()} />
          ) : visible.length === 0 ? (
            <EmptyBlock
              message={
                filter === 'pending'
                  ? '확인할 숙제가 없어요.'
                  : filter === 'approved'
                    ? '아직 승인한 숙제가 없어요.'
                    : filter === 'rejected'
                      ? '아직 반려한 숙제가 없어요.'
                      : '아직 숙제 제출이 없어요.'
              }
            />
          ) : (
            <ul className="space-y-1.5">
              {visible.map((submission) => {
                const student = submissionStudent(submission)
                const chip =
                  submission.status === 'approved'
                    ? 'bg-[#E6F5EA] text-[#1F7A3D]'
                    : submission.status === 'rejected'
                      ? 'bg-[#FDECEC] text-[#B32B2B]'
                      : 'bg-[#FFF6DA] text-[#7A5B00]'
                return (
                  <li key={submission.id}>
                    <button
                      type="button"
                      onClick={() => openReview(submission)}
                      className="flex w-full items-center gap-2 rounded-2xl border border-blue-line bg-white px-3 py-2.5 text-left transition active:scale-[0.995] hover:bg-blue-soft/40"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF1F0] text-[15px]" aria-hidden="true">
                        🏠
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[13px] font-extrabold text-navy">{student.name}</span>
                          <span className="text-[11px] font-semibold text-navy/40">{student.grade}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${chip}`}>
                            {submissionStatusLabel(submission)}
                          </span>
                          {hasRejectedPart(submission) ? (
                            <span className="rounded-full bg-[#FDECEC] px-1.5 py-0.5 text-[10px] font-bold text-[#B32B2B]">부분 반려</span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] font-semibold text-navy/50">
                          {submission.date.slice(5).replace('-', '/')} · {submissionSummary(submission)} · 사진{' '}
                          {photoCount(submission.photo_paths)}장
                        </span>
                        {submission.status === 'approved' && teacherCommentText(submission) ? (
                          <span className="mt-1 flex items-start gap-1 rounded-lg bg-[#E9FAF0] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#177A4A]">
                            <span aria-hidden="true">👏</span>
                            <span className="line-clamp-1 break-keep">{teacherCommentText(submission)}</span>
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[18px] leading-none text-navy/30" aria-hidden="true">
                        ›
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

          <p className="mt-2.5 text-[10.5px] leading-snug text-navy/40">
            승인·반려는 숙제 기록에만 반영되고 드래곤볼 지급과는 별개예요 · 사진은 긴 변 1200px로 줄여 올라갑니다(장당 100~150KB)
          </p>
      </AdminSection>

      {/* 상세 확인 — 한 건씩 넘기며 처리 */}
      <Modal
        open={review !== null}
        title="숙제 제출 확인"
        description={
          review
            ? `${submissionStudent(review.submission).name} · ${submissionStudent(review.submission).grade} · ${formatSubmissionTime(
                review.submission.submitted_at,
              )}`
            : undefined
        }
        onClose={closeReview}
        wide
        footer={
          <>
            <button type="button" className="btn-outline" onClick={closeReview} disabled={saving}>
              닫기
            </button>
            <button
              type="button"
              className="btn-navy"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? (
                <Spinner className="h-4 w-4 border-white/40 border-t-white" />
              ) : isReviewed(review?.submission ?? { status: 'pending' }) ? (
                '고쳐서 저장'
              ) : (
                '확인(저장)'
              )}
            </button>
          </>
        }
      >
        {review ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-blue-line bg-blue-soft/40 px-3.5 py-3">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                <span className="font-semibold text-navy/45">학생</span>
                <span className="text-right font-bold text-navy">
                  {submissionStudent(review.submission).name} · {submissionStudent(review.submission).grade}
                </span>
                <span className="font-semibold text-navy/45">날짜</span>
                <span className="text-right font-bold text-navy tabular">{review.submission.date}</span>
                <span className="font-semibold text-navy/45">공부 시각</span>
                <span className="text-right font-bold text-navy tabular">
                  {studyWindowText(review.submission.started_at, review.submission.ended_at) || '—'}
                </span>
                <span className="font-semibold text-navy/45">제출 공부 시간</span>
                <span className="text-right font-bold text-[#D9382F] tabular">
                  {review.submission.submitted_minutes}분
                </span>
                <span className="font-semibold text-navy/45">제출 숙제 수</span>
                <span className="text-right font-bold text-[#D9382F] tabular">
                  {review.submission.submitted_problems === null
                    ? '미입력'
                    : `숙제 ${review.submission.submitted_problems}개`}
                </span>
              </div>
            </div>

            {/* 이미 확인한 제출 — 상태·칭찬·반려 사유를 고쳐 다시 저장할 수 있다 (2026-11-28) */}
            {isReviewed(review.submission) ? (
              <div className="rounded-2xl border border-[#E9A400]/40 bg-[#FFF6DA] px-3.5 py-2.5">
                <p className="text-[12px] font-bold text-[#7A5B00]">{rereviewNotice(review.submission)}</p>
                <p className="mt-1 text-[11px] font-semibold leading-snug text-[#8A6A00]/85">
                  지금 기록: {approvedLine(review.submission) || '0분 · 숙제 0개'} · 고친 적{' '}
                  {review.submission.review_edit_count ?? 0}번
                  {review.submission.reviewed_at
                    ? ` · 마지막 저장 ${formatSubmissionTime(review.submission.reviewed_at)}`
                    : ''}
                </p>
                <p className="mt-1 text-[11px] font-semibold leading-snug text-[#8A6A00]/85">
                  저장하면 그날 기록에서 이전 승인분을 빼고 새 결정을 반영해요. 훈출 등·하원과 드래곤볼은 그대로예요.
                </p>
              </div>
            ) : null}

            {/* 숙제 사진 — 눌러서 크게, 좌우로 넘기기 */}
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-bold text-navy/70">
                  숙제 사진 <span className="tabular text-navy/40">{photoCount(review.submission.photo_paths)}장</span>
                </p>
                <span className="text-[10.5px] font-semibold text-navy/40">눌러서 크게 · 좌우로 넘기기</span>
              </div>
              {photoCount(review.submission.photo_paths) === 0 ? (
                <div className="mt-1.5 rounded-2xl bg-[#FFF6DA] px-3 py-3 text-center text-[12px] font-semibold text-[#7A5B00]">
                  올린 사진이 없어요. 사진 없이 낸 제출이에요.
                </div>
              ) : (
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {review.submission.photo_paths.map((path, index) => (
                    <button
                      key={`${path}-${index}`}
                      type="button"
                      onClick={() => setPhotoOpen(index)}
                      className="relative aspect-square overflow-hidden rounded-xl bg-blue-soft"
                    >
                      {urls[path] ? (
                        <img src={urls[path]} alt={`숙제 사진 ${index + 1}`} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-navy/40">
                          사진 불러오는 중
                        </span>
                      )}
                      <span className="absolute bottom-0.5 right-0.5 rounded-full bg-navy/70 px-1.5 text-[10px] font-bold text-white tabular">
                        {index + 1}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 시간 승인/반려 + 문항수 승인/반려 */}
            <div className="rounded-2xl border border-blue-line px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12.5px] font-bold text-navy">처리</p>
                <div className="flex gap-1.5">
                  <button type="button" className="btn-ghost border border-[#1F7A3D]/25 px-2.5 py-1 text-[11px] font-bold text-[#1F7A3D]" onClick={allApprove}>
                    모두 승인
                  </button>
                  <button type="button" className="btn-ghost border border-[#B32B2B]/25 px-2.5 py-1 text-[11px] font-bold text-[#B32B2B]" onClick={allReject}>
                    모두 반려
                  </button>
                </div>
              </div>

              <div className="mt-2.5 space-y-2">
                <VerdictRow
                  label="공부 시간"
                  value={`${review.submission.submitted_minutes}분`}
                  approved={review.timeApproved}
                  onChange={(next) => patchReview({ timeApproved: next })}
                />
                <VerdictRow
                  label="숙제 수"
                  value={
                    review.submission.submitted_problems === null
                      ? '숙제 수 미입력'
                      : `숙제 ${review.submission.submitted_problems}개`
                  }
                  approved={review.problemsApproved}
                  disabled={review.submission.submitted_problems === null}
                  disabledNote="숙제 수가 없어 승인할 수 없어요 (반려하면 0개)"
                  onChange={(next) => patchReview({ problemsApproved: next })}
                />
              </div>

              <p className="mt-2 text-[10.5px] leading-snug text-navy/40">
                승인한 항목만 그날 기록에 더해져요 · 반려한 항목은 0으로 확정되고 다시 제출하지 않아요 · 드래곤볼과는
                별개예요
              </p>
            </div>

            {/* 선생님 칭찬 한마디 — 승인할 때 함께 남긴다 (비워두면 예전처럼 바로 승인) */}
            <PraiseEditor
              value={review.comment}
              onChange={(comment) => patchReview({ comment })}
              approved={review.timeApproved || review.problemsApproved}
            />

            {/* 반려 사유 */}
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-bold text-navy/70">반려 사유 메모 (학생에게 보여요)</p>
                <span className="text-[10.5px] font-semibold text-navy/35 tabular">
                  {review.reason.length}/{HOMEWORK_REASON_MAX}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {HOMEWORK_REJECT_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() =>
                      patchReview({ reason: toggleChip(review.reason, chip, HOMEWORK_REASON_MAX) })
                    }
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                      review.reason.includes(chip)
                        ? 'bg-[#B32B2B] text-white'
                        : 'border border-[#B32B2B]/25 bg-white text-[#B32B2B]/80'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <textarea
                value={review.reason}
                onChange={(event) => patchReview({ reason: event.target.value.slice(0, HOMEWORK_REASON_MAX) })}
                rows={2}
                placeholder="예: 풀이 과정이 보이지 않아요. 다시 풀어서 사진을 올려주세요."
                className="mt-1.5 w-full resize-none rounded-xl border border-blue-line px-3 py-2 text-[12px] text-navy focus:outline-none focus:ring-2 focus:ring-blue-brand/30"
              />
            </div>

            {reviewError ? <ErrorBlock message={reviewError} /> : null}

            {!review.timeApproved && !review.problemsApproved ? (
              <p className="rounded-2xl bg-[#FDECEC] px-3 py-2 text-center text-[11.5px] font-semibold text-[#B32B2B]">
                {isReviewed(review.submission)
                  ? '모두 반려로 고쳐 저장하면 이 제출의 승인분이 그날 기록에서 빠져요.'
                  : '모두 반려예요. 저장하면 이 제출은 0분·숙제 0개로 확정돼요.'}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {photoOpen !== null && review ? (
        <PhotoPager
          urls={photoUrls}
          index={photoOpen}
          onIndexChange={setPhotoOpen}
          onClose={() => setPhotoOpen(null)}
          altPrefix="숙제 사진"
        />
      ) : null}

      {toast ? (
        <div className="fixed inset-x-3 bottom-4 z-[70] mx-auto flex max-w-sm items-center gap-2 rounded-2xl bg-navy px-4 py-3 text-[12px] font-semibold text-white shadow-lg">
          <span className="flex-1 break-words">{toast}</span>
          <button type="button" className="shrink-0 underline" onClick={() => setToast(null)}>
            닫기
          </button>
        </div>
      ) : null}
    </div>
  )
}

function VerdictRow({
  label,
  value,
  approved,
  onChange,
  disabled = false,
  disabledNote,
}: {
  label: string
  value: string
  approved: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  disabledNote?: string
}): JSX.Element {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-navy/60">
          {label} <span className="ml-1 font-bold text-navy tabular">{value}</span>
        </p>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-pressed={approved}
            onClick={() => onChange(true)}
            disabled={disabled}
            className={`rounded-full px-3 py-1 text-[11.5px] font-bold transition disabled:opacity-35 ${
              approved ? 'bg-[#1F7A3D] text-white' : 'border border-blue-line bg-white text-navy/55'
            }`}
          >
            승인
          </button>
          <button
            type="button"
            aria-pressed={!approved}
            onClick={() => onChange(false)}
            className={`rounded-full px-3 py-1 text-[11.5px] font-bold transition ${
              !approved ? 'bg-[#B32B2B] text-white' : 'border border-blue-line bg-white text-navy/55'
            }`}
          >
            반려(0)
          </button>
        </div>
      </div>
      {disabled && disabledNote ? <p className="mt-1 text-[10.5px] font-semibold text-[#B07A00]">{disabledNote}</p> : null}
    </div>
  )
}
