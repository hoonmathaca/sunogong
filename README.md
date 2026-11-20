# 선오공 (훈수학학원 공부 기록 앱)

학생이 4자리 코드로 들어와 공부 시간과 푼 문제 수를 기록하고,
원장님이 관리자 화면에서 학원 전체 기록을 보고 랭킹을 뽑는 웹앱입니다.

- **스택**: React 18 + TypeScript + Vite + Tailwind CSS + Supabase JS
- **언어/시간**: 한국어, 모든 날짜·시간은 한국 시간(`Asia/Seoul`) 기준
- **색**: 남색 `#12296B` · 파랑 `#1D4A9B` · 배경 흰색/연한 하늘색 `#F0F5FF`

---

## 1. 처음 설치

```bash
npm install
cp .env.example .env      # 아래 값을 채워주세요
```

`.env`

| 변수 | 설명 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL (`https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon(public) 키 |
| `VITE_ADMIN_PASSWORD` | 관리자 입장 비밀번호 (비워 두면 `0801`) |

## 2. 데이터베이스 만들기

Supabase Dashboard → **SQL Editor** 에서 순서대로 실행합니다.

1. `supabase/schema.sql` — 테이블 3개(`students`, `study_sessions`, `study_logs`), 서버 시각·타이머 RPC, RLS 정책, 권한
2. `supabase/seed.sql` — 기존 데이터 이관 (**학생 51명 + 공부 기록 2건**, 원래 UUID 그대로)

두 파일 모두 여러 번 실행해도 안전합니다(`if not exists` / `on conflict do nothing`).
실행 후 확인:

```sql
select count(*) from public.students;   -- 51
select count(*) from public.study_logs; -- 2
```

> **2026-11-19 변경분은 이미 운영 DB(`sunogong`)에 반영되어 있습니다.**
> 다른 프로젝트에 새로 올릴 때는 `supabase/schema.sql` 전체를 한 번 실행하면 됩니다(여러 번 실행해도 안전).
> 변경 이력은 두 파일로 남겨 두었습니다.
> - `supabase/migrate-2026-11-19-study-kind.sql` — 공부 종류(학원/숙제) 열 추가(기존 기록은 '학원 공부'로 1회 채움), 자정 넘긴 세션 버리기
> - `supabase/migrate-2026-11-19-homework-pause.sql` — 숙제 공부 자동 일시정지, `pause_session` 시간 계산 보정

## 3. 실행 / 빌드

```bash
npm run dev        # 개발 서버 (http://localhost:5173)
npm run typecheck  # 타입 검사만
npm run build      # 타입 검사 + 프로덕션 빌드 (dist/)
npm run preview    # 빌드 결과 확인
```

---

## 4. 이미지 파일

원장님이 보내준 마스코트·로고 원본에서 앱에 쓰는 이미지를 모두 만들었습니다.

| 파일 | 쓰이는 곳 |
|---|---|
| `public/images/mascot-full.png` (800×800, 투명) | 첫 화면(제목 옆), 타이머, 결과 화면 |
| `public/images/mascot-face.png` (512×512, 투명) | 관리자 화면 상단 |
| `public/images/hunsu-logo.png` (512×512, 투명) | 관리자 로그인 화면, 공유 미리보기 |
| `public/images/hunsu-badge.png` (256×256, 원형) | **모든 화면 맨 아래에만** 작게 + "훈수학학원" |
| `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`(180×180) | 홈 화면 아이콘 |
| `public/images/og-image.png` (1200×630) | 카카오톡·SNS 링크 미리보기 |

같은 이미지를 다시 만들려면: `python3 tools/make_images.py <마스코트_원본> <로고_원본>`

> 배포 후에는 `index.html` 의 `og:image` / `twitter:image` 를 실제 주소
> (`https://내주소/images/og-image.png`)로 바꿔 주세요. 대부분의 메신저는 상대 경로를 읽지 않습니다.

---

## 5. 화면 구성

### 학생 (`/`)
0. **컴퓨터(PC)에서는 열리지 않습니다** — `스마트폰 또는 태블릿에서만 이용할 수 있어요` 안내 화면이 뜨고,
   아래 `관리자 페이지` 버튼으로 `/admin` 에 갈 수 있습니다(`src/lib/device.ts` 판별, `src/components/DesktopBlockScreen.tsx`).
   - 허용: 아이폰·아이패드·안드로이드 폰/태블릿 User-Agent, 그리고 아이패드가 맥처럼 보낼 때(`Macintosh` + `maxTouchPoints > 1`)
   - 차단: 그 밖의 데스크톱 User-Agent(윈도우·맥·리눅스·크롬북). 터치스크린 윈도우 노트북도 컴퓨터라서 차단합니다.
   - `/admin` 은 컴퓨터에서도 그대로 열립니다.
1. **코드 입력** — 4자리 숫자 키패드. 코드는 문자열이라 `0575`처럼 앞자리 0이 유지됩니다.
   같은 코드를 쓰는 학생이 여럿이면 `누구세요?` 이름 선택 화면이 뜹니다.
2. **홈** — 오늘 누적 공부시간과 **학원 공부(남색)·숙제 공부(보라)** 시간을 색 칩으로 따로 표시, `공부 기록` 카드에 **최근 7일 / 최근 30일** 전환 · 기간 합계와 두 색 비율 막대(인바디형) · 날짜별 누적 막대(30일은 카드 안에서 스크롤), `공부 시작`
3. **타이머** — `🏫 학원 공부 시작` / `🏠 숙제 공부 시작` 두 가지로 시작하고, `HH:MM:SS` · 종류 배지 · `일시정지` / `종료`(일시정지 중에는 `계속` / `종료`)
   - **`⛶ 전체화면`** — 브라우저 주소창·하단 내비게이션 바를 숨긴다(`document.documentElement.requestFullscreen()`). 다시 누르면 `⛶ 전체화면 나가기`(`exitFullscreen()`).
   - 숙제 공부: `📵 숙제 공부는 화면을 끄거나 나가면 멈춰요` 안내 + **`🌙 화면보호 모드`** 버튼(어두운 저조도 화면, 화면 아무 곳이나 누르면 `☀️ 밝게 보기`로 복귀)
     - 화면보호 모드를 켜면 전체화면도 함께 시도하고, 끄면 함께 해제한다(브라우저가 거절하면 조용히 넘어감).
   - **잔상(번인) 방지** — 화면보호 모드나 전체화면으로 켜둔 동안 1분마다 타이머 화면 내용을 2~6px 범위에서 조금씩 옮긴다(같은 픽셀이 계속 켜지지 않게).
   - **아이폰** — 사파리는 일반 웹페이지 전체화면을 막으므로 오류 없이 안내 문구만 보여 준다(`‘홈 화면에 추가’로 열면 주소창 없이 쓸 수 있어요`).
   - 학원 공부: `🏫 학원 공부는 화면이 꺼져도 계속 가요` 안내
4. **종료** — `공부를 마칠까요?` → `오늘 푼 문제 수` 키패드(0 가능) → 저장
5. **결과** — `오늘 ○시간 ○분 공부했어요` + 오늘 합계 · 오늘 학원/숙제 시간 · 푼 문제 수

### 관리자 (`/admin`, 첫 화면의 `관리자` 버튼)
- 비밀번호 `0801` (`VITE_ADMIN_PASSWORD` 로 변경). 기기에 로그인이 유지되고 로그아웃 버튼이 있습니다.
- **대시보드**: 최근 30일 기본, 기간 변경 · 학년 필터(표와 그래프 모두 적용) · 학생×날짜 표(시간이 길수록 진한 남색, 미제출 회색, 주말 배경) · 칸을 누르면 그 날 기록 수정/삭제 · 학년별 요약(접기/펼치기) · 학생 비교 막대그래프 · 미제출 학생(오늘/이번 주/이번 달) · CSV(UTF-8 BOM)
- **학원 공부(🏫)와 숙제 공부(🏠)를 따로 집계**: 위쪽 요약 카드(총 공부시간 · 학원 · 숙제 · 푼 문제 · 1인당 평균), 학생×날짜 표의 합계 칸과 칸 아래 비율 막대, 학년별 요약(학생마다 학원/숙제 따로 + 합계), 학생 비교 막대(학원은 남색 · 숙제는 보라색으로 쌓인 막대), 학생 상세(최근 30일 학원/숙제 합계), CSV 두 종류 모두에 반영. 종류가 없던 예전 기록은 학원 공부로 본다.
- **학생 관리**: 추가/수정/삭제, 학년(초1~고3, 미지정), 같은 코드면 `동일코드` 배지, 이름·코드 검색, 학생별 기록 관리
- **랭킹**: 이번 달(기본) / 지난달 / 월 선택 / 전체 누적, 학년 필터, 연속 공부·공부시간·문제 풀이 TOP3, 동점은 같은 순위(제출 일수 많은 학생 먼저), **이미지로 저장**(html2canvas)

### 홈 화면 설치(PWA)
`public/manifest.webmanifest` — `display: standalone`, `theme_color #12296B`, `background_color #ffffff`.
(`display: "fullscreen"` 은 상태 표시줄까지 사라져 시계·배터리를 볼 수 없어 쓰지 않았다. 화면 안의 `⛶ 전체화면` 버튼이 주소창만 숨긴다.)
**Service Worker / 오프라인 캐시는 넣지 않았습니다.** 학생 첫 화면 아래에 iOS Safari / Android Chrome 설치 안내 배너가 뜨고,
닫으면 `localStorage`에 기억해 다시 뜨지 않습니다.

---

## 6. 타이머 규칙 (서버 기준)

모든 시각은 Supabase 서버 `now()` 로 저장하고, 화면 숫자는 서버 시각과 기기 시각의 차이를 보정해 계산합니다.

| 규칙 | 처리 위치 |
|---|---|
| 시작/일시정지/계속/종료 시각 저장 | `start_session`, `pause_session`, `resume_session`, `finish_session` |
| 진행 중인 세션이 있으면 코드 입력 시 타이머로 복귀 | `active_session` → `start_session` |
| 하루 여러 번 → `study_logs`(학생+날짜 unique)에 누적 합산 | `finish_session` 의 `on conflict do update` |
| 학원/숙제 구분 저장 (`study_sessions.kind`) 과 종류별 집계 (`study_logs.academy_*`, `homework_*`) | `start_session(p_kind)`, `finish_session` |
| **학원 공부: 화면을 꺼도 시간은 계속 간다** (공부 시간으로 인정) | `visibilitychange`/`blur`/`pagehide` 로는 멈추지 않음 |
| 학원 공부: 페이지를 떠날 때는 그 시각만 남긴다 (아이폰은 화면 잠금에도 pagehide 가 와서 멈추지 않음) | `heartbeatBeacon` (keepalive) |
| **숙제 공부: 화면을 끄거나 다른 화면·앱으로 나가면 즉시 일시정지** | `visibilitychange hidden`/`blur`/`pagehide` → `pause_sessionBeacon`(keepalive) + 화면 즉시 반영 |
| 숙제 공부: 요청이 닿지 못해도 서버가 30초 뒤 자동 일시정지 (멈춘 시각 = 마지막 신호) | `reconcile_session` (kind = homework) |
| 앱을 닫았다가 다시 열면 마지막 신호 시각까지로 일시정지 | 클라이언트 `isHeartbeatStale` + `pause_session` |
| 10초마다 마지막 신호 시각만 갱신 (서버가 임의로 멈추지 않게) | `study_sessions.last_heartbeat_at` 직접 갱신 |
| 일시정지 시간은 한 번만 뺀다 (멈춘 시각 = 마지막 신호면 그 뒤 시간은 이미 안 세므로 `paused_seconds` 를 또 더하지 않음) | `pause_session` |
| 1회 최대 5시간(300분), 넘으면 자동 종료 | 클라이언트 안내 + 서버 18,000초 상한 |
| **자정(00:00) 전에 종료를 누르지 않으면 기록하지 않고 버린다** | 클라이언트 자정 타이머 + `discard_session`, `reconcile_session` |
| 같은 종료 요청이 두 번 와도 기록이 두 번 쌓이지 않음 | `finish_session` 이 `finished` 상태를 먼저 확인 |

화면이 꺼지지 않도록 **Screen Wake Lock** 을 쓰고, 지원하지 않는 브라우저에서는
`화면을 켜둔 채로 공부해주세요` 안내를 보여줍니다.

> 웹 브라우저는 "화면 꺼짐"과 "다른 앱으로 전환"을 완전히 구분하지 못합니다. 그래서 숙제 공부는
> 화면 꺼짐·앱 전환·창 포커스 이탈을 모두 "나갔다"로 보고 멈춥니다(요청하신 동작). 학원 공부는
> 반대로 화면이 꺼져도 계속 흐릅니다.

---

## 7. 폴더 구조

```
sunogong/
├─ index.html                 # meta, og:image, manifest, 폰트
├─ public/
│  ├─ manifest.webmanifest
│  ├─ images/                 # mascot-full / mascot-face / hunsu-logo / og-image
│  └─ icons/                  # icon-192 / icon-512 / apple-touch-icon
├─ supabase/
│  ├─ schema.sql              # 테이블 + RPC + RLS
│  └─ seed.sql                # 기존 51명 + 2건
├─ tools/make_placeholders.py # 자리표시자 이미지 생성(선택)
├─ tools/lib-test.ts          # 날짜·집계·랭킹·타이머·전체화면·잔상 이동 계산 테스트(개발용)
├─ tools/ssr-smoke.tsx        # 모든 화면 렌더 확인(개발용)
└─ src/
   ├─ main.tsx, App.tsx, index.css
   ├─ lib/                    # supabase.ts, api.ts, time.ts, session.ts, stats.ts, grades.ts, csv.ts, device.ts, types.ts
   ├─ components/             # ErrorBoundary, Brand(마스코트·로고·푸터), Keypad, Modal, InstallBanner, DesktopBlockScreen(PC 안내)
   ├─ student/                # StudentApp, CodeEntry, ChooseStudent, Home, Timer, Result, useStudyTimer
   └─ admin/                  # AdminApp, AdminLogin, Dashboard, StudentsPanel, RankingPanel, Charts, 모달들
```

---

## 8. 배포 메모

- 글꼴: 앱 전체가 **나눔스퀘어 라운드(NanumSquareRound)** 를 씁니다. 웹폰트 파일(`400·700·800`)은
  `public/fonts/` 에 함께 들어 있어 외부 CDN 없이 서비스에서 바로 받습니다(`src/index.css` 의 `@font-face`).
  라이선스는 SIL Open Font License 1.1 이며 같은 폴더의 `OFL.txt` 에 있습니다. 글꼴을 바꾸려면
  `tailwind.config.js` 의 `fontFamily` 와 `src/index.css` 의 `@font-face` 를 같이 고치면 됩니다.
- 정적 호스팅(Vercel, Netlify, Cloudflare Pages 등)에 `dist/` 를 올리고, 빌드 명령은 `npm run build`.
- `/admin` 으로 바로 들어오는 주소가 404가 되지 않도록 **SPA rewrite** 를 켜 주세요.
  - Vercel: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
  - Netlify: `/* /index.html 200`
- 환경변수(`VITE_*`)는 빌드 시점에 들어갑니다. 값을 바꾸면 다시 빌드해야 합니다.

### 보안에 대해
- 앱은 Supabase **anon 키**로 동작하고, `students`/`study_sessions`/`study_logs` 는 RLS 정책상 익명 사용자도 읽고 쓸 수 있습니다.
  (학생이 코드만으로 기록을 남기는 구조라 필요합니다.)
- 관리자 비밀번호는 **화면 잠금** 수준입니다. 데이터 자체를 보호해야 한다면 Supabase Auth(교사 계정)와
  역할 기반 RLS로 바꾸는 것을 권합니다. 필요하면 그 작업도 이어서 해 드릴 수 있어요.

---

## 9. 검증한 것

```bash
npm run build       # tsc -b + vite build 통과 (타입 오류 0)
```

추가로 개발용 점검 스크립트를 돌려 두었습니다.

```bash
# 1) 날짜·집계·랭킹·타이머 계산 단위 테스트
npx vite build --ssr tools/lib-test.ts --outDir .smoke && node .smoke/lib-test.js

# 2) 모든 화면이 오류 없이 그려지는지 (서버 없이 첫 렌더 확인)
npx vite build --ssr tools/ssr-smoke.tsx --outDir .smoke && node .smoke/ssr-smoke.js

# 3) SQL 문법 검증 (PostgreSQL 파서)
python3 -c "import pglast; pglast.parse_sql(open('supabase/schema.sql').read())"
```

결과: 단위 테스트 전부 통과(99건 — 날짜·집계·학원/숙제 분리 집계·비율·랭킹·타이머·기기 판별 포함), 11개 화면 모두 렌더 성공, `schema.sql`/`seed.sql` 문법 오류 없음.
기기 판별(학생 화면 PC 차단) 테스트 16건도 함께 통과합니다 — 아이폰·아이패드·안드로이드 허용, 윈도우·맥·리눅스·크롬북(터치 노트북 포함) 차단.
실제 Supabase 프로젝트에 붙여 라이브로 돌려보는 확인은 프로젝트 키를 넣은 뒤에 할 수 있습니다.
