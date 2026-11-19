import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 선오공 - 훈수학학원 공부 기록 웹앱
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  build: { outDir: 'dist', sourcemap: false, target: 'es2019' },
})
