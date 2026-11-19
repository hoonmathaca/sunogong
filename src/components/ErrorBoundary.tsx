import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** 문제가 생겼을 때 보여줄 화면 (없으면 기본 안내) */
  fallback?: ReactNode
  onReset?: () => void
}

interface State {
  hasError: boolean
  message: string
}

/**
 * 화면 일부에서 오류가 나도 앱 전체가 멈추지 않게 하는 경계.
 * 새로고침 없이 "다시 시도"로 해당 부분만 되살린다.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했어요.',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[sunogong] 화면 오류:', error, info.componentStack)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, message: '' })
    try {
      this.props.onReset?.()
    } catch (error) {
      console.error('[sunogong] reset 실패:', error)
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-lg font-bold text-navy">잠깐 문제가 생겼어요</p>
          <p className="text-sm text-navy/60">잠시 후 다시 시도해 주세요.</p>
          {this.state.message ? (
            <p className="max-w-full break-words rounded-xl bg-blue-soft px-3 py-2 text-xs text-navy/50">
              {this.state.message}
            </p>
          ) : null}
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn-navy" onClick={this.handleReset}>
              다시 시도
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                try {
                  window.location.reload()
                } catch {
                  /* 무시 */
                }
              }}
            >
              새로고침
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
