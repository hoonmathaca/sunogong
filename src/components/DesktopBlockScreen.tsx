import { Link } from 'react-router-dom'
import { BrandFooter, Mascot } from './Brand'

/**
 * 컴퓨터(PC)로 학생 화면에 들어왔을 때 보여 주는 안내 화면.
 * 선오공은 학생이 쓰는 앱이라 스마트폰·태블릿에서만 열리고,
 * 원장님은 컴퓨터에서 아래 `관리자 페이지` 로 바로 갈 수 있다.
 */
export function DesktopBlockScreen(): JSX.Element {
  return (
    <div className="screen bg-gradient-to-b from-blue-soft/70 to-white">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <Mascot variant="full" className="h-24 w-24" />

        <h1 className="mt-4 font-round text-[24px] font-extrabold leading-tight text-navy">
          스마트폰 또는 태블릿에서만
          <br />
          이용할 수 있어요
        </h1>
        <p className="mt-3 text-[14px] font-semibold leading-relaxed text-navy/60">
          선오공은 학생이 공부 시간을 기록하는 앱이라
          <br />
          휴대폰·태블릿 화면에 맞춰 만들었어요.
        </p>

        <div className="card mt-6 w-full max-w-sm text-left">
          <p className="text-[13px] font-bold text-navy">이렇게 열어주세요</p>
          <ul className="mt-2 space-y-1.5 text-[13px] font-semibold leading-relaxed text-navy/70">
            <li className="flex gap-2">
              <span aria-hidden="true">1.</span>
              <span>
                휴대폰·태블릿에서 <span className="font-bold text-navy">sunogong.vercel.app</span> 을 엽니다.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true">2.</span>
              <span>선생님께 받은 4자리 코드로 들어갑니다.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true">3.</span>
              <span>‘홈 화면에 추가’를 하면 주소창 없이 바로 열 수 있어요.</span>
            </li>
          </ul>
        </div>

        <p className="mt-5 text-[12px] font-semibold text-navy/45">
          컴퓨터에서는 관리자 페이지만 열 수 있어요.
        </p>
        <Link
          to="/admin"
          className="btn-outline mt-2 border-blue-line px-3 py-1.5 text-[12px] text-navy/70"
        >
          관리자 페이지
        </Link>
      </div>
      <BrandFooter />
    </div>
  )
}
