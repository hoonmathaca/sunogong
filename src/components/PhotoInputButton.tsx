import type { ChangeEvent, MouseEvent, Ref } from 'react'

interface PhotoInputButtonProps {
  /** 화면에 보이는 이름 (예: 📷 바로 찍기) */
  label: string
  /** 화면 읽기용 이름 — 보이는 이름과 같게 두면 된다 */
  inputLabel?: string
  /** 폰 기본 카메라를 바로 연다 (multiple 과 함께 쓰지 않는다) */
  capture?: boolean
  /** 여러 장 고르기 (앨범) */
  multiple?: boolean
  disabled?: boolean
  /** 채운 버튼 / 테두리 버튼(흰색) / 색은 className 으로 직접 */
  tone?: 'primary' | 'ghost' | 'plain'
  /** 버튼 색 — 숙제 사진은 빨강(학파 숙빨), 질문 사진은 보라 (기본) */
  accent?: 'purple' | 'homework'
  /** 자동 점검용 표시 — camera / album / retake */
  name: string
  onFiles: (files: File[]) => void
  inputRef?: Ref<HTMLInputElement>
  /** 버튼 모양 덧붙이기 (높이·글자 크기 등) */
  className?: string
}

/**
 * 사진 고르기 버튼.
 *
 * 안드로이드 크롬·PWA에서 `display:none` 인 input 을 `ref.click()` 로 여는 방식은
 * 카메라·앨범을 한 번 다녀오거나 뒤로가기로 돌아온 뒤에는 파일 선택기가 다시 열리지 않는다.
 * (브라우저가 '사용자 동작'이 없는 클릭으로 보거나, 앞서 연 선택기 상태가 남기 때문)
 *
 * 그래서 여기서는 누를 수 있는 투명 input 을 버튼 위에 그대로 겹쳐 둔다.
 * 손가락이 input 에 바로 닿으므로 브라우저 입장에서 늘 진짜 사용자 동작이고,
 * input 은 화면에서 사라지지 않으므로(display:none 아님) 몇 번을 다시 눌러도 카메라·앨범이 열린다.
 * 매번 value 를 비워 같은 사진을 다시 골라도 change 가 오게 한다.
 */
export function PhotoInputButton({
  label,
  inputLabel,
  capture = false,
  multiple = false,
  disabled = false,
  tone = 'ghost',
  accent = 'purple',
  name,
  onFiles,
  inputRef,
  className = '',
}: PhotoInputButtonProps): JSX.Element {
  const handleClick = (event: MouseEvent<HTMLInputElement>) => {
    // 앞서 고른 값이 남아 있으면 같은 사진을 다시 골라도 change 가 오지 않는다 — 누를 때마다 비운다
    event.currentTarget.value = ''
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    /* FileList 를 먼저 배열로 옮긴 뒤 비운다 (value 를 비우면 FileList 가 비는 브라우저가 있다) */
    const picked = input.files ? Array.from(input.files) : []
    input.value = ''
    if (picked.length > 0) onFiles(picked)
  }

  const palette =
    accent === 'homework'
      ? {
          primary: 'bg-[#E0453E] text-white shadow-sm',
          ghost: 'border border-[#E0453E]/30 bg-[#FFF7F6] text-[#C4332B]',
          ring: 'focus-within:ring-2 focus-within:ring-[#E0453E]/40',
        }
      : {
          primary: 'bg-[#6D3BD6] text-white shadow-sm',
          ghost: 'border border-[#6D3BD6]/30 bg-[#F5F0FF] text-[#4A28A0]',
          ring: 'focus-within:ring-2 focus-within:ring-[#6D3BD6]/40',
        }
  const look = tone === 'primary' ? palette.primary : tone === 'plain' ? '' : palette.ghost

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-xl transition ${palette.ring} ${
        disabled ? 'opacity-40' : 'active:scale-[0.98]'
      } ${look} ${className || 'h-[42px]'}`}
    >
      <span aria-hidden="true" className="pointer-events-none select-none whitespace-nowrap px-1 text-[12.5px] font-bold">
        {label}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        {...(capture ? { capture: 'environment' as const } : {})}
        {...(multiple ? { multiple: true } : {})}
        disabled={disabled}
        aria-label={inputLabel ?? label}
        data-photo-input={name}
        onClick={handleClick}
        onChange={handleChange}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </div>
  )
}
