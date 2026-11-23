import {
  approvedLine,
  hasRejectedPart,
  photoCount,
  rejectReasonText,
  showsTeacherComment,
  submissionLine,
  submissionStatusLabel,
  teacherCommentText,
} from '../lib/homeworkBoard'
import type { HomeworkSubmission } from '../lib/types'

/**
 * 학생 홈 「숙제 제출」 목록의 한 줄.
 * · 승인 대기 / 승인 / 반려 배지와 사진 수, 승인된 시간·문항수
 * · 반려했으면 빨간 「반려 사유: …」 박스
 * · 승인하고 선생님이 한마디를 남겼으면 민트색 「선생님 한마디: …」 박스 (없으면 박스 없이 깔끔하게)
 */
export function HomeworkSubmissionRow({ submission }: { submission: HomeworkSubmission }): JSX.Element {
  const chipClass =
    submission.status === 'approved'
      ? 'bg-[#E6F5EA] text-[#1F7A3D]'
      : submission.status === 'rejected'
        ? 'bg-[#FDECEC] text-[#B32B2B]'
        : 'bg-[#FFF6DA] text-[#7A5B00]'
  const approved = approvedLine(submission)
  const reason = rejectReasonText(submission)
  const comment = teacherCommentText(submission)

  return (
    <li className="rounded-2xl border border-blue-line/70 bg-white px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12.5px] font-bold text-navy">{submissionLine(submission)}</p>
          <p className="mt-0.5 break-keep text-[11px] font-semibold text-navy/45">
            사진 {photoCount(submission.photo_paths)}장{approved ? ` · ${approved}` : ''}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${chipClass}`}>
          {submissionStatusLabel(submission)}
        </span>
      </div>
      {hasRejectedPart(submission) && reason ? (
        <p className="mt-1 break-keep rounded-xl bg-[#FDECEC] px-2 py-1 text-[11px] font-semibold text-[#B32B2B]">
          반려 사유: {reason}
        </p>
      ) : null}
      {showsTeacherComment(submission) ? (
        <p className="mt-1 flex items-start gap-1 break-keep rounded-xl border border-[#B9E8CE] bg-[#E9FAF0] px-2 py-1 text-[11px] font-semibold text-[#177A4A]">
          <span className="shrink-0" aria-hidden="true">
            👏
          </span>
          <span className="min-w-0">
            <span className="font-extrabold">선생님 한마디:</span> {comment}
          </span>
        </p>
      ) : null}
    </li>
  )
}
