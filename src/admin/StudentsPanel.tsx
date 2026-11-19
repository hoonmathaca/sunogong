import { useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { Spinner } from '../components/Keypad'
import { GRADE_OPTIONS, compareName, gradeRank, normalizeGrade } from '../lib/grades'
import * as api from '../lib/api'
import { todayKst } from '../lib/time'
import type { Student } from '../lib/types'
import { StudentDetailModal } from './StudentDetailModal'
import { AdminSection, CodeBadge, EmptyBlock, ErrorBlock, LoadingBlock } from './ui'

interface StudentsPanelProps {
  students: Student[]
  loading: boolean
  error: string | null
  reload: () => void
}

interface FormState {
  id: string | null
  name: string
  code: string
  grade: string
}

const EMPTY_FORM: FormState = { id: null, name: '', code: '', grade: normalizeGrade('') }

export function StudentsPanel({ students, loading, error, reload }: StudentsPanelProps): JSX.Element {
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Student | null>(null)
  const [recordStudent, setRecordStudent] = useState<Student | null>(null)

  const codeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const student of students) counts.set(student.code, (counts.get(student.code) ?? 0) + 1)
    return counts
  }, [students])

  const visible = useMemo(() => {
    const keyword = search.trim()
    const list = keyword
      ? students.filter((student) => student.name.includes(keyword) || student.code.includes(keyword))
      : students
    return [...list].sort((a, b) => {
      const gradeDiff = gradeRank(a.grade) - gradeRank(b.grade)
      if (gradeDiff !== 0) return gradeDiff
      return compareName(a.name, b.name)
    })
  }, [students, search])

  const openNew = () => {
    setFormError(null)
    setForm({ ...EMPTY_FORM })
  }

  const openEdit = (student: Student) => {
    setFormError(null)
    setForm({ id: student.id, name: student.name, code: student.code, grade: normalizeGrade(student.grade) })
  }

  const save = async () => {
    if (!form) return
    const name = form.name.trim()
    const code = form.code.trim()
    if (name.length === 0) {
      setFormError('이름을 입력해주세요.')
      return
    }
    if (!/^[0-9]{4}$/.test(code)) {
      setFormError('코드는 숫자 4자리예요. (앞자리 0도 그대로 입력)')
      return
    }
    setBusy(true)
    setFormError(null)
    const payload = { name, code, grade: normalizeGrade(form.grade) }
    const res = form.id ? await api.updateStudent(form.id, payload) : await api.createStudent(payload)
    setBusy(false)
    if (res.ok) {
      setForm(null)
      reload()
    } else {
      setFormError(res.error)
    }
  }

  const remove = async () => {
    if (!deleting) return
    setBusy(true)
    const res = await api.deleteStudent(deleting.id)
    setBusy(false)
    if (res.ok) {
      setDeleting(null)
      reload()
    } else {
      setFormError(res.error)
    }
  }

  return (
    <div className="space-y-4">
      <AdminSection
        title="학생 관리"
        description={`전체 ${students.length}명 · 코드는 중복될 수 있어요(같은 코드면 '동일코드' 표시).`}
        actions={
          <button type="button" className="btn-navy px-4 py-2 text-[12px]" onClick={openNew}>
            학생 추가
          </button>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="이름 또는 코드로 찾기"
            className="w-full max-w-xs rounded-xl border border-blue-line px-3 py-2 text-[13px] text-navy focus:outline-none focus:ring-2 focus:ring-blue-brand/30"
          />
          <span className="text-[11px] font-semibold text-navy/40">{visible.length}명</span>
          <button type="button" className="btn-ghost ml-auto border border-blue-line text-[11px]" onClick={reload}>
            새로고침
          </button>
        </div>

        {error ? <ErrorBlock message={error} onRetry={reload} /> : null}

        {loading ? (
          <LoadingBlock />
        ) : visible.length === 0 ? (
          <EmptyBlock message="해당하는 학생이 없어요." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-blue-line">
            <table className="w-full min-w-[560px] border-collapse text-[12px]">
              <thead>
                <tr className="bg-blue-soft/70 text-[11px] text-navy/60">
                  <th className="px-3 py-2 text-left font-bold">이름</th>
                  <th className="px-3 py-2 text-left font-bold">코드</th>
                  <th className="px-3 py-2 text-left font-bold">학년</th>
                  <th className="px-3 py-2 text-right font-bold">관리</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((student) => (
                  <tr key={student.id} className="border-t border-blue-line">
                    <td className="px-3 py-2 font-bold text-navy">{student.name}</td>
                    <td className="px-3 py-2 tabular text-navy/70">
                      <span className="inline-flex items-center gap-1.5">
                        {student.code}
                        <CodeBadge duplicated={(codeCounts.get(student.code) ?? 0) > 1} />
                      </span>
                    </td>
                    <td className="px-3 py-2 text-navy/60">{normalizeGrade(student.grade)}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="rounded-lg px-2 py-1 text-[11px] font-bold text-blue-brand hover:bg-blue-soft"
                          onClick={() => setRecordStudent(student)}
                        >
                          기록
                        </button>
                        <button
                          type="button"
                          className="rounded-lg px-2 py-1 text-[11px] font-bold text-navy/60 hover:bg-blue-soft"
                          onClick={() => openEdit(student)}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="rounded-lg px-2 py-1 text-[11px] font-bold text-red-500 hover:bg-red-50"
                          onClick={() => {
                            setFormError(null)
                            setDeleting(student)
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>

      {/* 추가/수정 */}
      <Modal
        open={Boolean(form)}
        title={form?.id ? '학생 정보 수정' : '학생 추가'}
        description="코드는 학생이 입력할 숫자 4자리예요. 같은 코드를 여러 학생이 써도 됩니다."
        onClose={() => setForm(null)}
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setForm(null)} disabled={busy}>
              취소
            </button>
            <button type="button" className="btn-navy" onClick={() => void save()} disabled={busy}>
              {busy ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : '저장'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-[12px] font-semibold text-navy/60">
            이름
            <input
              type="text"
              value={form?.name ?? ''}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
              className="mt-1 w-full rounded-xl border border-blue-line px-3 py-2 text-[15px] font-bold text-navy focus:outline-none focus:ring-2 focus:ring-blue-brand/30"
              placeholder="학생 이름"
            />
          </label>
          <label className="block text-[12px] font-semibold text-navy/60">
            4자리 코드
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={form?.code ?? ''}
              onChange={(event) =>
                setForm((prev) => (prev ? { ...prev, code: event.target.value.replace(/[^0-9]/g, '').slice(0, 4) } : prev))
              }
              className="mt-1 w-full rounded-xl border border-blue-line px-3 py-2 text-[15px] font-bold tabular text-navy focus:outline-none focus:ring-2 focus:ring-blue-brand/30"
              placeholder="0000"
            />
          </label>
          <label className="block text-[12px] font-semibold text-navy/60">
            학년
            <select
              value={form?.grade ?? ''}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, grade: event.target.value } : prev))}
              className="mt-1 w-full rounded-xl border border-blue-line bg-white px-3 py-2 text-[14px] font-bold text-navy focus:outline-none focus:ring-2 focus:ring-blue-brand/30"
            >
              {GRADE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {formError ? <p className="break-words rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-500">{formError}</p> : null}
        </div>
      </Modal>

      {/* 삭제 확인 */}
      <Modal
        open={Boolean(deleting)}
        title="학생을 삭제할까요?"
        description={
          <span>
            <strong className="text-navy">{deleting?.name}</strong> 학생의 공부 기록도 함께 지워져요. 되돌릴 수 없습니다.
          </span>
        }
        onClose={() => setDeleting(null)}
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setDeleting(null)} disabled={busy}>
              취소
            </button>
            <button
              type="button"
              className="btn-navy bg-red-500 hover:bg-red-600"
              onClick={() => void remove()}
              disabled={busy}
            >
              {busy ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : '삭제'}
            </button>
          </>
        }
      >
        {formError ? <p className="break-words rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-500">{formError}</p> : null}
      </Modal>

      <StudentDetailModal
        open={Boolean(recordStudent)}
        student={recordStudent}
        endDate={todayKst()}
        onClose={() => setRecordStudent(null)}
        onChanged={reload}
      />
    </div>
  )
}
