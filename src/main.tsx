import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { watchForNewBuild } from './lib/appUpdate'

const container = document.getElementById('root')

if (container) {
  createRoot(container).render(<App />)
  // 새로 배포된 뒤에도 예전 탭이 옛 규칙으로 계속 도는 일을 줄인다
  watchForNewBuild()
} else {
  console.error('[sunogong] #root 요소를 찾을 수 없어요.')
}
