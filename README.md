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

1. `supabase/schema.sql` — 테이블 5개(`students`, `study_sessions`, `study_logs`, `study_questions`, `push_subscriptions`), 서버 시각·타이머 RPC, Storage 버킷(`question-images`), RLS 정책, 권한
2. `supabase/seed.sql` — 기존 데이터 이관 (**학생 51명 + 공부 기록 2건**, 원래 UUID 그대로)
3. **`supabase/migrate-2026-11-21-questions.sql` — '선오공에게 질문하기' Q&A** (아래 표·버킷만 추가)
   - 운영 DB에는 **이 파일을 한 번 실행해야 질문 기능이 켜집니다.** 실행 전에는 학생 화면에 `질문 기능을 아직 준비 중이에요` 안내가 뜨고, 공부 기록·타이머는 그대로 동작합니다.
   - `study_questions` 표, Storage 버킷 `question-images`(비공개, 파일 1개 50MB), RLS 정책을 만듭니다.
   - `schema.sql` 전체를 새로 실행해도 같은 결과가 됩니다(이미 반영된 파일).
4. **`supabase/migrate-2026-11-21-push.sql` — 관리자 '새 질문 알림'(웹 푸시)**
   - `push_subscriptions` 표(알림을 켠 관리자 기기), `study_questions.push_notified_at`(같은 질문에 한 번만 알림), RLS 정책을 만듭니다.
   - 운영 DB(`qdzlenhmhszdsnygslhp`)에는 **2026-11-21 적용 완료**입니다. 실행 전에는 관리자 화면의 알림 카드에 `알림 표가 아직 없어요` 안내가 뜨고, 질문·공부 기록은 그대로 동작합니다.

네 파일 모두 여러 번 실행해도 안전합니다(`if not exists` / `on conflict do nothing` / 정책은 지웠다가 다시 생성).
실행 후 확인:

```sql
select count(*) from public.students;         -- 51
select count(*) from public.study_logs;       -- 2
select count(*) from public.study_questions;      -- 0 (질문이 쌓이면 늘어남)
select count(*) from public.push_subscriptions;   -- 0 (알림 켠 기기 수)
select id, public, file_size_limit from storage.buckets where id = 'question-images';
```

> **2026-11-19 변경분은 이미 운영 DB(`sunogong`)에 반영되어 있습니다.**
> 다른 프로젝트에 새로 올릴 때는 `supabase/schema.sql` 전체를 한 번 실행하면 됩니다(여러 번 실행해도 안전).
> 변경 이력은 아래 파일들로 남겨 두었습니다.
> - `supabase/migrate-2026-11-19-study-kind.sql` — 공부 종류(학원/숙제) 열 추가(기존 기록은 '학원 공부'로 1회 채움), 자정 넘긴 세션 버리기
> - `supabase/migrate-2026-11-19-homework-pause.sql` — 숙제 공부 자동 일시정지, `pause_session` 시간 계산 보정
> - `supabase/migrate-2026-11-21-questions.sql` — 질문(Q&A) 표·Storage 버킷
> - `supabase/migrate-2026-11-21-push.sql` — 새 질문 알림(웹 푸시) 구독 표 (2026-11-21 운영 DB 적용 완료)

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
2. **홈** — 오늘 누적 공부시간과 **학원 공부(남색)·숙제 공부(보라)** 시간을 색 칩으로 따로 표시, `공부 기록` 카드에 **최근 7일 / 최근 30일** 전환 · 기간 합계와 두 색 비율 막대(인바디형) · 날짜별 누적 막대(30일은 카드 안에서 스크롤), **☁️ 근두운**(지금 공부 중인 친구 수·구름·실시간 순위·닉네임 바꾸기)과 **🐉 내 드래곤볼**, `공부 시작`
3. **타이머** — `🏫 학원 공부 시작` / `🏠 숙제 공부 시작` 두 가지로 시작하고, `HH:MM:SS` · 종류 배지 · `일시정지` / `종료`(일시정지 중에는 `계속` / `종료`)
   - **`⛶ 전체화면`** — 브라우저 주소창·하단 내비게이션 바를 숨긴다(`document.documentElement.requestFullscreen()`). 다시 누르면 `⛶ 전체화면 나가기`(`exitFullscreen()`).
   - 숙제 공부: `📵 숙제 공부는 화면을 끄거나 나가면 멈춰요` 안내 + **`🌙 화면보호 모드`** 버튼(어두운 저조도 화면, 화면 아무 곳이나 누르면 `☀️ 밝게 보기`로 복귀)
     - **☁️ 근두운 한 줄** — 숙제 공부 타이머 위쪽에 `N명 공부 중` 과 친구 3명(닉네임 + 진행 시간, 내 이름은 노란색)을 얇은 줄로 띄운다. 타이머 숫자·일시정지·종료 버튼을 가리지 않고, 15초마다 새로 읽으며 그 사이 1초마다 시간이 흐른다(`src/student/LiveKintounStrip.tsx`, 화면보호 모드에서는 어두운 색). 학원 공부 타이머에는 나오지 않는다.
     - 화면보호 모드를 켜면 전체화면도 함께 시도하고, 끄면 함께 해제한다(브라우저가 거절하면 조용히 넘어감).
   - **잔상(번인) 방지** — 화면보호 모드나 전체화면으로 켜둔 동안 1분마다 타이머 화면 내용을 2~6px 범위에서 조금씩 옮긴다(같은 픽셀이 계속 켜지지 않게).
   - **아이폰** — 사파리는 일반 웹페이지 전체화면을 막으므로 오류 없이 안내 문구만 보여 준다(`‘홈 화면에 추가’로 열면 주소창 없이 쓸 수 있어요`).
   - 학원 공부: `🏫 학원 공부는 화면이 꺼져도 계속 가요` 안내
   - **`💬 선오공에게 질문하기`** — 공부 중에 바로 문제 사진을 올린다. 창을 여는 동안(사진 찍으러 카메라로 넘어가는 동안 포함) **타이머는 멈추지 않는다**.
4. **종료** — `공부를 마칠까요?` → `오늘 푼 문제 수` 키패드(0 가능) → 저장
5. **결과** — `오늘 ○시간 ○분 공부했어요` + 오늘 합계 · 오늘 학원/숙제 시간 · 푼 문제 수

### 근두운 · 드래곤볼 (2026-11-21)

학생 홈의 오늘 공부 카드 아래에 두 카드가 붙습니다. 15초마다 새로 읽고, 그 사이에는 1초마다 시간만 흘려 보냅니다.

- **☁️ 근두운 (숙제 타이머)** — 숙제 공부 타이머 위쪽에 같은 현황을 한 줄로 줄여 띄운다(`N명 공부 중 · 이름 + 시간`). 홈 카드와 같은 `live_study_board()` 를 쓰고 15초마다 새로 읽는다.
- **☁️ 근두운 (홈)** — 지금 공부 중인 친구 수(`N명`), 공부 중인 친구들의 **닉네임 + 진행 시간**을 **작은 구름** 안에 넣어 위아래로 둥둥 떠다니게 보여 준다(`src/index.css` 의 `kintoun-bob`·`kintoun-drift`, 구름마다 박자를 조금씩 다르게). 모바일 폭에서는 구름이 줄바꿈되고, 이름이 길면 말줄임으로 줄인다. 잠깐 쉬는 친구는 구름 대신 `😴 잠깐 쉬는 중` 한 줄로 보여 준다.
- **🔥 실시간 연속 공부 순위** — 멈추지 않고 이어서 공부 중인 시간 기준 상위 5명(동점은 같은 순위), 내 순위는 `내 순위 N위 / M명` 으로 따로 표시하고 내 줄은 노란 배경.
- **닉네임** — `근두운에 보이는 내 이름` 옆 `바꾸기` 버튼(최대 10자, 비우면 `수련생`). 같은 이름이 둘 이상이면 `수련생 A · 수련생 B` 로 구분해 보여 준다.
- **🐉 내 드래곤볼** — 보유 개수를 **제한 없이** 계속 누적해 보여 준다(12개까지 아이콘 + `외 N개`). 7개 교환·보상 정책은 아직 정하지 않았으므로 **교환 버튼은 넣지 않았다**.
- **실명은 밖으로 나가지 않는다** — 서버 함수 `live_study_board()` 가 `nickname · status · started_at · seconds · is_me` 만 돌려준다(실명·학년·학생 id 없음). 닉네임을 정하지 않은 학생은 `수련생` 으로 보인다.

### 선오공에게 질문하기 (Q&A)
- **홈 진입 버튼** — 공부 기록 카드 아래 `💬 선오공에게 질문하기`. 아직 열지 않은 답변이 있으면 `새 답변 N` 배지가 붙는다.
- **질문 올리기** — `📷 사진 찍기` / `🖼️ 앨범에서` 로 문제 사진을 고르고, 한 줄 메모(선택, 200자)를 적어 올린다.
  - 사진은 올리기 전에 브라우저 Canvas 로 긴 쪽 1400px·JPEG(품질 0.82)로 줄여 올린다(`src/lib/imageCompress.ts`). 촬영 위치 정보 같은 메타데이터도 함께 사라진다.
- **내 질문 카드** — 내가 올린 사진·메모와 그 아래 **선오공이** 답변(글 + 해설지 사진 또는 훈노트 영상)을 카드로 보여 준다.
  - `답변 대기` / `답변 완료` 배지, 새로 온 답변에는 `새 답변` 표시(화면을 열면 읽음 처리).
  - 사진은 눌러서 크게 보고, 동영상은 카드 안에서 바로 재생된다(`<video controls playsInline>`).
- 사진은 **비공개 Storage 버킷**에 올라가고, 화면에는 1시간짜리 서명 URL 로만 보인다.

### 관리자 (`/admin`, 첫 화면의 `관리자` 버튼)
- 비밀번호 `0801` (`VITE_ADMIN_PASSWORD` 로 변경). 기기에 로그인이 유지되고 로그아웃 버튼이 있습니다.
- **대시보드**: 최근 30일 기본, 기간 변경 · 학년 필터(표와 그래프 모두 적용) · 학생×날짜 표(시간이 길수록 진한 남색, 미제출 회색, 주말 배경) · 칸을 누르면 그 날 **기록 수정/삭제** · 학년별 요약(접기/펼치기) · 학생 비교 막대그래프 · 미제출 학생(오늘/이번 주/이번 달) · CSV(UTF-8 BOM)
- **기록 수정 모달 — 학원·숙제 따로 입력**: 🏫 학원 공부 / 🏠 숙제 공부의 **공부시간(분)·푼 문제 수**를 각각 고치면 전체 공부시간(`minutes`)·문제 수(`problems`)는 학원+숙제로 자동 계산해 저장합니다(`academy_*`·`homework_*`도 함께 갱신). 학원·숙제 구분이 없던 예전 기록은 기존 기준대로 학원 공부로 채워 열리고, 안내 문구로 알려 줍니다. 표의 칸(대시보드)과 학생 상세의 `수정` 버튼이 같은 모달을 엽니다. 계산은 `src/lib/logEdit.ts`.
- **학원 공부(🏫)와 숙제 공부(🏠)를 따로 집계**: 위쪽 요약 카드(총 공부시간 · 학원 · 숙제 · 푼 문제 · 1인당 평균), 학생×날짜 표의 합계 칸과 칸 아래 비율 막대, 학년별 요약(학생마다 학원/숙제 따로 + 합계), 학생 비교 막대(학원은 남색 · 숙제는 보라색으로 쌓인 막대), 학생 상세(최근 30일 학원/숙제 합계), CSV 두 종류 모두에 반영. 종류가 없던 예전 기록은 학원 공부로 본다.
- **실시간** (상단 탭, 예전 이름 `근두운`): 지금 공부 중인 학생을 **실명 + 근두운 닉네임 + 진행 시간 + 보유 드래곤볼** 로 보여 주고, **선오공이 드래곤볼 쏘기** 로 **전체 일괄**(공부 중인 학생 전원, 원하면 `쉬는 중인 학생도 포함`) · **개별**(줄마다 `☄️ N개 쏘기`) 지급을 한다. 한 번에 1~99개, 쏘면 드래곤볼이 위로 날아가는 애니메이션과 결과 문구가 뜨고 아래 `드래곤볼 지급 이력`(최근 12건)에 누가 몇 개를 받았는지 남는다. 15초마다 새로 읽는다.
- **질문함** (상단 탭, 답변 대기 건수 배지): 학생 질문을 **답변 대기 우선**으로 보고 `답변 대기 / 답변 완료 / 전체` 로 거른다. 사진을 눌러 크게 보고, **선오공이** 이름으로 답변 글 + 해설지 사진 또는 **훈노트 영상**(MP4·WebM·MOV, 50MB 이하)을 달거나 수정하고, 질문을 삭제(사진·영상 포함)할 수 있다.
  - **오래된 질문 자동 정리** — 질문함을 열 때 **답변 완료 후 7일**이 지난 질문과 Storage 사진·영상을 자동으로 지운다(끄기 스위치 있음, `지금 정리` 버튼도 있음). DB 줄만 지우지 않고 파일까지 지워서 무료 용량이 실제로 비워진다.
- **🔔 새 질문 알림** (질문함 맨 위 카드): 이 기기에서 알림을 **켜기/끄기**, 알림 받는 **기기 수**, **테스트 알림 보내기**.
  - 켜면 학생이 질문을 올릴 때마다 휴대폰에 `선오공 새 질문` 알림이 오고, 누르면 `/admin?tab=questions`(질문함)이 바로 열린다.
  - 기기마다 따로 켜야 한다(원장님 폰·태블릿 각각). 아이폰은 홈 화면에 추가한 선오공에서만 켤 수 있다(iOS 16.4+).
- **학생 관리**: 추가/수정/삭제, 학년(초1~고3, 미지정), 같은 코드면 `동일코드` 배지, 이름·코드 검색, 학생별 기록 관리
- **랭킹**: 이번 달(기본) / 지난달 / 월 선택 / 전체 누적, 학년 필터, 연속 공부·공부시간·문제 풀이 TOP3, 동점은 같은 순위(제출 일수 많은 학생 먼저), **이미지로 저장**(html2canvas)

### 홈 화면 설치(PWA) 및 새 질문 알림(웹 푸시)
`public/manifest.webmanifest` — `display: standalone`, `theme_color #12296B`, `background_color #ffffff`.
(`display: "fullscreen"` 은 상태 표시줄까지 사라져 시계·배터리를 볼 수 없어 쓰지 않았다. 화면 안의 `⛶ 전체화면` 버튼이 주소창만 숨긴다.)
학생 첫 화면 아래에 iOS Safari / Android Chrome 설치 안내 배너가 뜨고, 닫으면 `localStorage`에 기억해 다시 뜨지 않는다.

**서비스 워커(`public/sw.js`)는 알림만 담당한다.** 캐시·오프라인 저장은 하지 않고 `fetch` 를 가로채지도 않는다(push 이벤트 → 알림 표시, 알림을 누르면 `/admin?tab=questions`).

**새 질문 알림**: 관리자 `/admin` → **질문함** 맨 위의 **🔔 새 질문 알림** 카드에서 켜고 끈다.
- 켜기 = `Notification.requestPermission()` → `navigator.serviceWorker.register('/sw.js')` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → Supabase `push_subscriptions` 에 저장
- 학생이 질문을 올리면 `src/lib/questions.ts` 의 `createQuestion` 이 **기다리지 않고**(non-blocking) `POST /api/notify-question` 을 호출한다 → Vercel Serverless Function `api/notify-question.ts` 가 `web-push`(VAPID)로 등록된 관리자 기기에 발송(제목 `선오공 새 질문`, 본문 `{학생이름} 학생이 질문을 올렸어요!`). 만료된 구독(404/410)은 자동으로 지운다.
- 같은 질문에 두 번 알리지 않도록 `study_questions.push_notified_at` 을 한 번만 표시한다(요청이 겹쳐 와도 한 번).
- **관리자만** '테스트 알림 보내기'를 쓸 수 있다(`x-sunogong-admin` 머리글 = 관리자 비밀번호).
- 아이폰은 **홈 화면에 추가한 선오공**에서만 알림을 켤 수 있어(iOS 16.4+) 그 안내를 화면에 띄운다.

**필요한 Vercel 환경변수** (Production)

| 변수 | 설명 |
|---|---|
| `VAPID_PRIVATE_KEY` | **필수·비밀**. `npx web-push generate-vapid-keys` 의 privateKey 값. 없으면 알림 서버가 503 `push_not_configured` 로 답하고 화면에 안내가 뜬다 |
| `VAPID_PUBLIC_KEY` | 선택. 비워도 `src/lib/pushBoard.ts` · `api/notify-question.ts` 의 기본 공개 키를 쓴다(키를 바꿀 때만 넣으면 된다) |
| `VAPID_SUBJECT` | 선택. 기본 `mailto:illkg1@gmail.com` |

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
| **공부 중 '선오공에게 질문하기' 창을 여는 동안(카메라로 넘어간 시간 포함)에는 숙제 공부도 멈추지 않는다** | `holdOnLeave` — 창을 닫을 때 마지막 신호를 현재로 다시 맞춤 |
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
├─ api/notify-question.ts     # Vercel Serverless Function — 새 질문 웹 푸시 발송
├─ public/
│  ├─ manifest.webmanifest
│  ├─ sw.js                   # 서비스 워커(알림 표시·클릭 이동만)
│  ├─ images/                 # mascot-full / mascot-face / hunsu-logo / og-image
│  └─ icons/                  # icon-192 / icon-512 / apple-touch-icon
├─ supabase/
│  ├─ schema.sql              # 테이블 6개 + RPC + Storage 버킷 + RLS
│  ├─ seed.sql                # 기존 51명 + 2건
│  ├─ migrate-2026-11-21-questions.sql  # '선오공에게 질문하기' 표·버킷·정책
│  ├─ migrate-2026-11-21-push.sql       # 새 질문 알림 구독 표
│  ├─ migrate-2026-11-21-kintoun-dragonball.sql  # 닉네임·근두운·드래곤볼 함수·표
│  └─ verify-2026-11-21-kintoun-dragonball.sql   # 근두운·드래곤볼 SQL 검증(되돌림)
├─ tools/make_placeholders.py # 자리표시자 이미지 생성(선택)
├─ tools/lib-test.ts          # 날짜·집계·랭킹·타이머·기기 판별·질문(Q&A)·알림 계산 테스트(개발용)
├─ tools/ssr-smoke.tsx        # 모든 화면 렌더 확인(개발용)
└─ src/
   ├─ main.tsx, App.tsx, index.css
   ├─ lib/                    # supabase.ts, api.ts, time.ts, session.ts, stats.ts, logEdit.ts(기록 수정 계산), grades.ts, csv.ts, device.ts, types.ts,
   │                          # questions.ts(Q&A DB·Storage), questionBoard.ts(질문 순수 함수), imageCompress.ts(사진 줄이기),
   │                          # push.ts(알림 켜기/끄기·구독 저장), pushBoard.ts(알림 순수 함수·VAPID 공개 키),
   │                          # kintoun.ts(근두운·드래곤볼 DB 함수), kintounBoard.ts(근두운 순수 함수 — 닉네임·순위·구름·드래곤볼)
   ├─ components/             # ErrorBoundary, Brand(마스코트·로고·푸터), Keypad, Modal, ImageViewer(사진 확대), InstallBanner, DesktopBlockScreen(PC 안내), KintounCloud(구름·드래곤볼)
   ├─ student/                # StudentApp, CodeEntry, ChooseStudent, Home, Timer, Result, useStudyTimer,
   │                          # QuestionBoardScreen(질문 화면), QuestionAskForm(질문 올리기 폼), LiveKintounCard(근두운·내 드래곤볼)
   └─ admin/                  # AdminApp, AdminLogin, Dashboard, StudentsPanel, RankingPanel, QuestionsPanel(질문함), PushNotifyPanel(알림 설정), KintounPanel(실시간 탭·드래곤볼 쏘기), Charts, 모달들
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
- **`api/notify-question.ts` 는 Vercel 이 `api/` 폴더를 보고 자동으로 서버리스 함수로 배포합니다**(`/api/notify-question`). 따로 설정할 것은 없고, 서버 전용 비밀 값만 환경변수로 넣으면 됩니다 — `VAPID_PRIVATE_KEY`(필수), `VAPID_PUBLIC_KEY`·`VAPID_SUBJECT`(선택), `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY`·`VITE_ADMIN_PASSWORD`(앱과 같은 값). 위 '홈 화면 설치(PWA) 및 새 질문 알림' 절의 표를 보세요.

### 보안에 대해
- 앱은 Supabase **anon 키**로 동작하고, `students`/`study_sessions`/`study_logs`/`study_questions`/`push_subscriptions`/`dragonball_grants` 는 RLS 정책상 익명 사용자도 읽고 쓸 수 있습니다.
  (학생이 코드만으로 기록을 남기는 구조라 필요합니다. 알림 구독 표도 서버 함수가 같은 anon 키로 읽고 지웁니다.)
  **근두운은 `live_study_board()` 함수가 닉네임·시간만 돌려주므로 화면에는 실명이 나가지 않지만, anon 키를 아는 사람이 표를 직접 읽으면 학생 이름을 볼 수 있는 것은 예전과 같습니다.** 완전히 가리려면 Supabase Auth(학생·교사 계정)로 바꿔야 하며, 그 작업은 이어서 할 수 있습니다.
  그래서 `push_subscriptions` 의 `endpoint`·`p256dh`·`auth` 는 anon 키로 읽힐 수 있지만, 그 값만으로는 다른 기기로 알림을 보낼 수 없습니다(VAPID 비밀 키는 Vercel 서버에만 있음).
- 질문 사진·답변 사진/영상은 **비공개 Storage 버킷**(`question-images`)에 올라가고, 화면에서는 1시간짜리 **서명 URL** 로만 보입니다.
  버킷 정책은 앱과 같은 anon 키로 읽고 쓰는 구조라, 강한 보호가 필요하면 Supabase Auth(교사·학생 계정)로 바꾸는 것을 권합니다.
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
npx vite build --ssr tools/ssr-smoke.tsx --outDir .smoke2 && node .smoke2/ssr-smoke.js

# 3) SQL 문법 검증 (PostgreSQL 파서)
python3 -c "import pglast; pglast.parse_sql(open('supabase/schema.sql').read())"

# 4) 근두운·드래곤볼 SQL 검증 (검증용 학생을 만들었다가 자동으로 되돌립니다)
#    Supabase SQL Editor 에 supabase/verify-2026-11-21-kintoun-dragonball.sql 을 붙여넣고 실행
```

결과: 단위 테스트 전부 통과(**218건** — 날짜·집계·학원/숙제 분리 집계·기록 수정 계산·비율·랭킹·타이머·기기 판별·질문(Q&A)·알림(VAPID 키·기기 판별·구독 저장 모양·오류 문구)·근두운(닉네임·시간·구름·실시간 순위·타이머 근두운 줄·드래곤볼) 계산 포함), **20개 화면** 모두 렌더 성공(관리자 알림 카드·근두운 패널 포함), `schema.sql`/`seed.sql`/`migrate-2026-11-21-questions.sql`/`migrate-2026-11-21-push.sql`/`migrate-2026-11-21-kintoun-dragonball.sql` 문법 오류 없음, 근두운 SQL 검증 7건 통과(검증 데이터는 되돌림 — 남은 검증용 학생 0명).
기기 판별(학생 화면 PC 차단) 테스트 16건도 함께 통과합니다 — 아이폰·아이패드·안드로이드 허용, 윈도우·맥·리눅스·크롬북(터치 노트북 포함) 차단.
화면 점검에는 `선오공에게 질문하기` 홈·타이머 버튼, 학생 질문 화면, 질문 올리기 폼, 관리자 질문함(자동 정리 안내 포함), 관리자 상단 탭 이름(`실시간`)과 숙제 타이머의 근두운 줄(학원 타이머에는 없음)이 모두 들어 있습니다.
`'선오공이에게'` 대신 `'선오공에게'` 로만 표기되는지도 테스트로 확인합니다.

---

## 10. 저장 용량 관리 (질문 사진·영상)

Supabase 무료 플랜은 Storage **1GB** 까지 씁니다. 질문 사진은 올리기 전에 줄여서(장당 100~400KB) 올리고,
답변 영상은 1개 **50MB** 까지로 제한합니다(앱에서 미리 검사해 안내).

질문함을 열 때 **답변 완료 후 7일이 지난 질문과 사진·영상 파일을 자동으로 지운다** (`QuestionsPanel`, 기본 켜짐 · 끄기 스위치 있음).
- DB 줄(`study_questions`)을 지우는 것과 함께 **Storage 파일도 직접 지워서** 용량이 실제로 비워진다.
- 답변을 달지 않은 질문은 지우지 않는다.
- `지금 정리` 버튼으로 바로 정리할 수도 있고, 화면에 `지금 정리할 질문 N개` 가 표시된다.
- 보관 기간을 바꾸려면 `src/lib/questionBoard.ts` 의 `QUESTION_RETENTION_DAYS` 값을 고친다(기본 7일).

DB에 쌓이는 질문 줄은 글자 몇백 바이트라 용량에 거의 영향이 없고, 큰 것은 사진·영상 파일이다.
