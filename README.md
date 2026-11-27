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

1. `supabase/schema.sql` — 테이블 6개(`students`, `study_sessions`, `study_logs`, `study_questions`, `homework_submissions`, `push_subscriptions`), 서버 시각·타이머 RPC, Storage 버킷(`question-images`, `homework-photos`), RLS 정책, 권한
2. `supabase/seed.sql` — 기존 데이터 이관 (**학생 51명 + 공부 기록 2건**, 원래 UUID 그대로)
3. **`supabase/migrate-2026-11-21-questions.sql` — '선오공에게 질문하기' Q&A** (아래 표·버킷만 추가)
   - 운영 DB에는 **이 파일을 한 번 실행해야 질문 기능이 켜집니다.** 실행 전에는 학생 화면에 `질문 기능을 아직 준비 중이에요` 안내가 뜨고, 공부 기록·타이머는 그대로 동작합니다.
   - `study_questions` 표, Storage 버킷 `question-images`(비공개, 파일 1개 50MB), RLS 정책을 만듭니다.
   - `schema.sql` 전체를 새로 실행해도 같은 결과가 됩니다(이미 반영된 파일).
4. **`supabase/migrate-2026-11-21-push.sql` — 관리자 '새 질문 알림'(웹 푸시)**
   - `push_subscriptions` 표(알림을 켠 관리자 기기), `study_questions.push_notified_at`(같은 질문에 한 번만 알림), RLS 정책을 만듭니다.
   - 운영 DB(`qdzlenhmhszdsnygslhp`)에는 **2026-11-21 적용 완료**입니다. 실행 전에는 관리자 화면의 알림 카드에 `알림 표가 아직 없어요` 안내가 뜨고, 질문·공부 기록은 그대로 동작합니다.
5. **`supabase/migrate-2026-11-22-pause-autoend.sql` — 쉬는 시간 30분 알림 · 60분 자동 종료 · 다음 접속 때 문제 수 입력**
   - `study_sessions.problems_pending`·`auto_ended` 열과 `auto_end_paused_session()`, `set_session_problems()`, `pending_problem_sessions()` 함수를 만듭니다.
   - 운영 DB(`qdzlenhmhszdsnygslhp`)에는 **2026-11-22 적용 완료**입니다. 실행 전에도 타이머·기록은 그대로 동작하고, 자동 종료만 `알 수 없는 오류` 없이 원래대로 일시정지 상태로 남습니다.
6. **`supabase/migrate-2026-11-23-homework-photo-approval.sql` — 숙제 공부 사진 인증 · 시간/문항수 분리 승인 · 관리자 `숙제관리`**
   - `homework_submissions` 표, `close_homework_session()`·`submit_homework()`·`submit_pending_homework()`·`review_homework_submission()`·`pending_homework_submissions()`, Storage 버킷 `homework-photos`(비공개, 1개 5MB, 사진만), RLS 정책을 만들고 `finish_session`·`auto_end_paused_session`·`pending_problem_sessions` 를 새 규칙으로 바꿉니다.
   - 운영 DB(`qdzlenhmhszdsnygslhp`)에는 **2026-11-23 적용 완료**입니다. 실행 전에는 숙제 공부도 예전처럼 바로 기록에 들어가고, 학생 화면에는 `숙제 사진 기능을 아직 준비 중이에요` 가 뜰 수 있습니다.
7. **`supabase/migrate-2026-11-23-homework-photo-resume.sql` — 숙제 사진 초안 (카메라 전환으로 탭이 튕겨도 이어서 제출)**
   - `homework_submissions` 에 초안 열(`draft_active`·`draft_problems`·`draft_open`), `save_homework_draft()`·`clear_homework_draft()`, 초안 줄이 있어도 세션을 제대로 마무리하도록 고친 `close_homework_session()`, 초안을 빼고 진짜 제출만 돌려주는 `pending_homework_submissions()`, 세션이 지워질 때 초안도 정리하는 트리거를 만듭니다.
   - 운영 DB(`qdzlenhmhszdsnygslhp`)에는 **2026-11-23 적용 완료**입니다. 실행 전에도 사진 제출은 되지만, 탭이 튕기면 찍어 둔 사진이 사라집니다(초안 저장이 없음).
8. **`supabase/migrate-2026-11-23-homework-teacher-comment.sql` — 승인할 때 「선생님 칭찬 한마디」**
   - `homework_submissions.teacher_comment`(최대 200자) 열을 더하고, `review_homework_submission(..., p_teacher_comment)` 로 승인과 함께 저장합니다(모두 반려면 비웁니다).
   - 예전 화면이 부르던 4개 인자 호출도 그대로 됩니다(새 인자 기본값 null).
   - 운영 DB(`qdzlenhmhszdsnygslhp`)에는 **2026-11-23 적용 완료**입니다. 실행 전에는 칭찬 칸이 저장되지 않고(함수 인자 없음) 학생 화면에 박스가 나오지 않습니다. 화면은 예전처럼 승인만 됩니다.
9. **`supabase/migrate-2026-11-23-admin-end-study.sql` — 관리자 「수업 종료」**
   - `study_sessions.ended_by_admin` 열, `admin_end_study_session(session, problems)`(진행 중인 세션을 지금까지의 시간으로 마무리), `study_session_state(session)`(학생 기기가 선생님의 종료를 알아채는 읽기 전용 확인)을 만듭니다.
   - 운영 DB(`qdzlenhmhszdsnygslhp`)에는 **2026-11-23 적용 완료**입니다. 실행 전에는 실시간 탭의 「수업 종료」 버튼이 `근두운 기능을 아직 준비 중이에요` 로 답하고, 타이머는 그대로 흘러갑니다(다른 기능 영향 없음).
10. **`supabase/migrate-2026-11-23-stale-session-cleanup.sql` — 지난 날짜 미종료 세션 자동 정리**
   - `cleanup_stale_study_sessions(dry_run)`, `maybe_cleanup_stale_study_sessions()`, 미종료 세션 조회 인덱스를 만들고 `start_session`·`active_session`·`live_study_board` 가 맨 앞에서 정리하도록 바꿉니다.
   - **`pg_cron` 이 있으면 매일 00:05 KST(UTC 15:05)에 자동 실행**합니다. pg_cron 을 켤 수 없는 환경이면 예약만 건너뛰고, 앱을 쓰는 순간(학생 로그인·근두운 판) 정리되는 안전장치가 대신합니다.
   - 운영 DB(`qdzlenhmhszdsnygslhp`)에는 **2026-11-23 적용 완료**입니다(`pg_cron` 1.6.4 설치, 예약 작업 `sunogong-stale-session-cleanup`). 실행 전에도 앱은 그대로 동작하고, 지난 세션만 남아 있을 수 있습니다.

아홉 파일 모두 여러 번 실행해도 안전합니다(`if not exists` / `on conflict do nothing` / 정책은 지웠다가 다시 생성).
실행 후 확인:

```sql
select count(*) from public.students;         -- 51
select count(*) from public.study_logs;       -- 2
select count(*) from public.study_questions;      -- 0 (질문이 쌓이면 늘어남)
select count(*) from public.push_subscriptions;   -- 0 (알림 켠 기기 수)
select count(*) from public.students where dragons <> '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}';  -- 일반용을 만든 학생 수
select count(*) from public.study_sessions where problems_pending;   -- 문제 수 입력을 기다리는 세션 수
select count(*) from public.homework_submissions where status = 'pending' and not draft_active;  -- 승인을 기다리는 숙제 제출 수(초안 제외)
select count(*) from public.homework_submissions where draft_active;  -- 아직 제출 전인 사진 초안 수(보통 0~1)
select count(*) from public.study_sessions where ended_at is null and started_at < public.kst_today()::timestamp at time zone 'Asia/Seoul';  -- 지난 날 미종료 세션 (0이어야 함)
select jobid, jobname, schedule, active from cron.job where jobname = 'sunogong-stale-session-cleanup';  -- 매일 00:05 KST 예약
select id, public, file_size_limit from storage.buckets where id = 'question-images';
select id, public, file_size_limit from storage.buckets where id = 'homework-photos';
```

> **2026-11-19 변경분은 이미 운영 DB(`sunogong`)에 반영되어 있습니다.**
> 다른 프로젝트에 새로 올릴 때는 `supabase/schema.sql` 전체를 한 번 실행하면 됩니다(여러 번 실행해도 안전).
> 변경 이력은 아래 파일들로 남겨 두었습니다.
> - `supabase/migrate-2026-11-19-study-kind.sql` — 공부 종류(학원/숙제) 열 추가(기존 기록은 '학원 공부'로 1회 채움), 자정 넘긴 세션 버리기
> - `supabase/migrate-2026-11-19-homework-pause.sql` — 숙제 공부 자동 일시정지, `pause_session` 시간 계산 보정
> - `supabase/migrate-2026-11-21-questions.sql` — 질문(Q&A) 표·Storage 버킷
> - `supabase/migrate-2026-11-21-push.sql` — 새 질문 알림(웹 푸시) 구독 표 (2026-11-21 운영 DB 적용 완료)
> - `supabase/migrate-2026-11-21-rainbow-ball.sql` — `students.rainbow_ball_count`, `craft_rainbow_ball()`(칠성구 합치기) (2026-11-21 운영 DB 적용 완료)
> - `supabase/migrate-2026-11-22-pause-autoend.sql` — 일시정지 30분 알림·60분 자동 종료(`problems_pending`, `auto_ended` 열과 `auto_end_paused_session`·`set_session_problems`·`pending_problem_sessions`) (2026-11-22 운영 DB 적용 완료)
- `supabase/migrate-2026-11-23-homework-photo-approval.sql` — 숙제 공부 사진 인증·시간/문항수 분리 승인(`homework_submissions`, `submit_homework`·`submit_pending_homework`·`review_homework_submission`, Storage `homework-photos`) (2026-11-23 운영 DB 적용 완료)
> - `supabase/migrate-2026-11-23-homework-photo-resume.sql` — 숙제 사진 초안(`draft_active`·`draft_problems`·`draft_open`, `save_homework_draft`·`clear_homework_draft`, 초안이 있어도 세션을 마무리하는 `close_homework_session`) (2026-11-23 운영 DB 적용 완료)
> - `supabase/migrate-2026-11-23-admin-end-study.sql` — 관리자 「수업 종료」(`ended_by_admin`, `admin_end_study_session`, `study_session_state`) (2026-11-23 운영 DB 적용 완료)
> - `supabase/migrate-2026-11-23-stale-session-cleanup.sql` — 지난 날짜 미종료 세션 자동 정리(`cleanup_stale_study_sessions`·`maybe_cleanup_stale_study_sessions`, pg_cron 매일 00:05 KST) (2026-11-23 운영 DB 적용 완료)

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
| `public/images/mascot-full.png` (800×800, 투명) | 첫 화면(제목 옆), 타이머, 결과 화면 — **중앙 가르마·동그란 안경·訓 도복·근두운·주변 무지개 칠성구** 마스코트 |
| `public/images/mascot-face.png` (512×512, 투명) | 관리자·학생 화면 상단의 작은 얼굴 (44px 자리) — **머리(얼굴·귀)만** 나오게 잘라 둔 크롭(목 아래 도복·왼손 지팡이는 넣지 않는다, 턱선은 살짝 흐려 마무리) |
| `public/images/hunsu-logo.png` (512×512, 투명) | 관리자 로그인 화면, 공유 미리보기 |
| `public/images/hunsu-badge.png` (256×256, 원형) | **모든 화면 맨 아래에만** 작게 + "훈수학학원" |
| `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`(180×180) | 홈 화면 아이콘 |
| `public/images/og-image.png` (1200×630) | 카카오톡·SNS 링크 미리보기 |

같은 이미지를 다시 만들려면:

```bash
# 마스코트 (전신·얼굴·앱 아이콘·공유 미리보기) — 흰 배경을 지워 투명 PNG 로
python3 tools/make_mascot.py <마스코트_원본.png>
# 1~7성구 아이콘 (미리보기 시트까지)
python3 tools/make_dragonballs.py --sheet
# 무지개 신룡 → public/dragonballs/shenron.png (무지개용 아이콘)
python3 tools/make_shenron.py <신룡_원본.png>
# 일반용 7종(색만 바꾼 신룡) + 교환권 아이콘 3장
python3 tools/make_color_dragons.py
```

> 로고(`hunsu-logo.png`·`hunsu-badge.png`)는 마스코트와 별개라 그대로 둡니다.
> 예전 `tools/make_images.py` 는 마스코트와 로고를 함께 만들던 스크립트로, 지금은 위 세 스크립트를 씁니다.

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
   - **💬 오늘의 한줄 (2026-11-22)** — 키패드 바로 아래에 명언 카드 한 장(`src/lib/quotes.ts` 124개, `src/components/QuoteCard.tsx`). 화면(앱)을 열 때마다 한 개를 무작위로 골라 보여 주고, **카드는 누를 수 없는 일반 카드(`<div>`)라 눌러도 바뀌지 않습니다** — 예전 `눌러서 바꾸기` 문구와 탭 기능은 2026-11-22 원장님 요청으로 뺐습니다. 명언마다 출처(`— 이름 (작품·저서·장절)`)를 함께 보여 주고, 124개는 원장님이 확인한 99개 + 만화·애니·영화 명대사 25개입니다.
2. **홈** — 오늘 누적 공부시간과 **학원 공부(남색)·숙제 공부(보라)** 시간을 색 칩으로 따로 표시, `공부 기록` 카드에 **최근 7일 / 최근 30일** 전환 · 기간 합계와 두 색 비율 막대(인바디형) · 날짜별 누적 막대(30일은 카드 안에서 스크롤), **☁️ 근두운**(지금 공부 중인 친구 수·구름·실시간 순위·닉네임 바꾸기)과 **🐉 내 드래곤볼**, `🏠 숙제 공부 시작`
   - **2026-11-26 — `🏫 학원 공부 시작` 버튼을 홈에서 뺐습니다.** 학원 공부는 새 출결 앱 '훈출'이 등원·하원에 맞춰 자동으로 시작·정산하므로, 선오공에서는 학생이 따로 누르지 않습니다(아래 「12. 학원 공부 시작 버튼 제거」).
3. **타이머** — 학생이 시작하는 것은 `🏠 숙제 공부 시작` 하나이고(학원 공부 타이머는 훈출이 시작한 세션을 이어 보여 준다), `HH:MM:SS` · 종류 배지 · `일시정지` / `종료`(일시정지 중에는 `계속` / `종료`)
   - **`⛶ 전체화면`** — 브라우저 주소창·하단 내비게이션 바를 숨긴다(`document.documentElement.requestFullscreen()`). 다시 누르면 `⛶ 전체화면 나가기`(`exitFullscreen()`).
   - 숙제 공부: `📵 숙제 공부는 화면을 끄거나 나가면 멈춰요` 안내 + **`🌙 화면보호 모드`** 버튼(어두운 저조도 화면, 화면 아무 곳이나 누르면 `☀️ 밝게 보기`로 복귀)
     - **☁️ 근두운 한 줄** — 숙제 공부 타이머 위쪽에 `N명 공부 중` 과 친구 3명(닉네임 + 진행 시간, 내 이름은 노란색)을 얇은 줄로 띄운다. 타이머 숫자·일시정지·종료 버튼을 가리지 않고, 15초마다 새로 읽으며 그 사이 1초마다 시간이 흐른다(`src/student/LiveKintounStrip.tsx`, 화면보호 모드에서는 어두운 색). 학원 공부 타이머에는 나오지 않는다.
     - 화면보호 모드를 켜면 전체화면도 함께 시도하고, 끄면 함께 해제한다(브라우저가 거절하면 조용히 넘어감).
   - **잔상(번인) 방지** — 화면보호 모드나 전체화면으로 켜둔 동안 1분마다 타이머 화면 내용을 2~6px 범위에서 조금씩 옮긴다(같은 픽셀이 계속 켜지지 않게).
   - **아이폰** — 사파리는 일반 웹페이지 전체화면을 막으므로 오류 없이 안내 문구만 보여 준다(`‘홈 화면에 추가’로 열면 주소창 없이 쓸 수 있어요`).
   - 학원 공부: `🏫 학원 공부는 화면이 꺼져도 계속 가요` 안내
   - **`💬 선오공에게 질문하기`** — 공부 중에 바로 문제 사진을 올린다. 창을 여는 동안(사진 찍으러 카메라로 넘어가는 동안 포함) **타이머는 멈추지 않는다**.
   - **😴 쉬는 지 30분 → `아직 공부 중인가요?`** — 일시정지한 채 30분이 지나면 화면 알림창과 함께 진동·안내음·브라우저 알림을 띄운다. `계속 공부할래요` / `공부 끝내고 문제 수 입력` 중에 고르면 되고, 그냥 닫으면 타이머 아래에 `쉬는 지 N분 · N분 더 쉬면 자동으로 마무리돼요` 가 계속 보인다.
   - **⏱️ 쉬는 지 60분 → 자동 종료** — 30분 알림 뒤에도 응답이 없으면 세션을 자동으로 마무리한다. 공부 시간은 쉬기 전까지 실제로 공부한 시간으로 저장하고, 문제 수는 비워 둔 채(`problems_pending`) 홈으로 나가 바로 `지난번 푼 문제 수` 입력창을 띄운다.
4. **종료** — `공부를 마칠까요?` → `오늘 푼 문제 수` 키패드(0 가능, **0~999**) → 저장
   - **999를 넘기는 자리는 눌러도 들어가지 않고** 창 안에 `문제 수는 999개까지 넣을 수 있어요.` 안내가 뜬다(2026-11-23).
   - **🏠 숙제 공부는 `숙제 공부 제출` 창**에서 `오늘 공부한 페이지를 찍어올리고 푼 문제수를 적어주세요` 안내와 함께 **공부한 페이지 사진(최대 5장)** 을 붙인다. 사진은 필수가 아니라 **0장으로도 제출**할 수 있고, 0장으로 제출을 누르면 `사진 없이 공부를 마치면 반려될 수 있습니다. 그래도 제출하시겠습니까?` 를 한 번 더 묻는다(2026-11-23 부터). 종료를 누르면 그 순간 타이머가 멈춰 사진 고르는 시간이 공부 시간에 들어가지 않는다.
   - 낸 시간·문제 수는 기록에 바로 들어가지 않고 **승인 대기**로 남는다(아래 「숙제 공부 사진 인증」).
5. **결과** — `오늘 ○시간 ○분 공부했어요` + 오늘 합계 · 오늘 학원/숙제 시간 · 푼 문제 수. 숙제 공부는 `🙌 제출했어요 — 선생님 확인을 기다려요` 와 `오늘 기록(승인된 것)` 을 함께 보여 준다.
   - **2026-11-26 — 학원 공부 결과 화면에는 `공부 더 하기` 가 없습니다.** 학원 공부는 훈출이 시작하므로 결과 화면에서는 `홈으로` 만 두고, 숙제 공부 결과 화면에는 예전처럼 `공부 더 하기` 가 있습니다.
   - **✏️ 문제 수 수정 (2026-11-23)** — 학원 공부를 마친 결과 화면과 학생 홈(오늘 학원 기록이 있을 때)에 `✏️ 문제 수 수정` 이 있어, 오늘 학원 공부 문제 수를 학생이 직접 0~999 로 고칠 수 있다(아래 「문제 수 0~999 상한」).
   - **선생님이 수업을 마무리한 경우 (2026-11-23)** — 학생이 종료를 누르지 않아도 관리자 실시간 탭의 `수업 종료` 로 끝나면, 10초 안에 이 결과 화면으로 바뀌며 `선생님이 수업을 마무리해서 타이머를 멈췄어요` 가 함께 보인다. 숙제 공부는 `🙌 선생님이 마무리했어요 — 확인을 기다려요` 로 안내한다.
6. **지난번 푼 문제 수 (2026-11-22)** — 자동 종료된 공부가 남아 있으면, 다음에 코드를 넣고 홈에 들어올 때 `지난번 푼 문제 수` 창이 뜬다.
   - `11월 21일 (토) · 🏫 학원 공부 · 1시간 20분 공부` 처럼 어느 공부인지 보여 주고, 키패드로 문제 수를 넣으면 그 날 기록(문제 랭킹·통계)에 바로 더해진다.
   - **🏠 숙제 공부로 자동 종료된 것은 `지난 숙제 공부 제출` 창**으로 뜬다 — 같은 확정 안내 문구와 함께 사진(최대 5장)과 문제 수를 내면 승인 대기로 넘어간다.
   - `0`도 입력할 수 있고 `건너뛰기`도 된다. 건너뛰면 이번 접속에서는 다시 묻지 않고 **다음 접속 때 다시 물어본다**(기록에는 그대로 남는다). 건너뛰었어도 홈의 **✏️ 지난번 푼 문제 수** 카드를 누르면 그 자리에서 다시 입력할 수 있다.
   - 화면이 꺼진 채로 60분이 지나 있었어도, 다시 열면 그 자리에서 자동 종료 → 문제 수 입력으로 이어진다.

### 숙제 공부 사진 인증 · 승인 (2026-11-23)
숙제 공부는 **학생이 낸 시간·문제 수를 그대로 믿지 않고**, 공부한 페이지 사진과 함께 내서 **원장님이 확인한 뒤** 기록에 들어간다. 학원 공부(🏫)는 예전과 100% 똑같이 끝낼 때 바로 반영한다.

**학생**
- 숙제 타이머 종료 → `숙제 공부 제출` 창: 확정 안내 문구 `오늘 공부한 페이지를 찍어올리고 푼 문제수를 적어주세요`, `📷 바로 찍기`(폰 카메라)·`🖼️ 앨범에서 고르기`(최대 5장), 문제 수 키패드.
- 사진은 올리기 전에 브라우저에서 **긴 변 1200px · JPEG 품질 0.72** 로 줄여 올린다(장당 100~150KB, `src/lib/imageCompress.ts` 에 옵션만 넘겨서 재사용). 앨범·카메라 어느 쪽으로 찍어도 된다.
- 사진은 필수가 아니다 — **0장으로도 제출**되고, 5장을 넘겨 담을 수 없다. 사진 0장으로 `제출`을 누르면 바로 내지 않고 `사진 없이 공부를 마치면 반려될 수 있습니다. 그래도 제출하시겠습니까?` 확인 창이 뜨며, `취소` 면 제출 창으로 돌아가고 `그래도 제출` 이면 사진 0장 그대로 승인 대기에 들어간다(2026-11-23).
- 낸 뒤에는 결과 화면과 홈에 **`승인 대기`** 로 보이고, 원장님이 확인하면 **`승인`**(승인된 값) 또는 **`반려`**(사유 표시) 로 바뀐다. 홈 `숙제 제출` 카드에 최근 5건이 보인다.
- **👏 선생님 한마디 (2026-11-23)** — 승인한 건에 원장님이 칭찬·응원 한마디를 남겼으면, 카드 안에 **연두/민트색 박스 `👏 선생님 한마디: …`** 가 함께 보인다(`src/student/HomeworkSubmissionRow.tsx`). 반려 사유(빨간 박스)와 같은 자리·같은 크기이고, 한마디가 비어 있으면 박스 없이 예전처럼 깔끔하게 보인다.

**DB (`homework_submissions`)**
- 한 세션에 한 줄(`session_id unique`). `submitted_minutes`·`submitted_problems`(자동 종료 뒤 아직 모르면 `NULL`)·`photo_paths`(최대 5장)·`status(pending/approved/rejected)`·`time_verdict`·`problems_verdict`·`approved_minutes`·`approved_problems`·`reject_reason`·`reviewed_at`.
- `submit_homework(session, problems, photo_paths)` — 숙제 세션을 끝내고 승인 대기 줄을 만든다. 사진은 0장이어도 되고(2026-11-23), 5장을 넘으면 `too_many_photos`.
- `submit_pending_homework(submission, problems, photo_paths)` — 60분 자동 종료된 숙제의 문제 수·사진을 다음 접속 때 채운다.
- `review_homework_submission(submission, time_approved, problems_approved, reject_reason)` — **승인한 항목만** `study_logs` 의 `homework_minutes`·`homework_problems` 에 더하고(그 날 학원 기록과 합쳐짐), 반려한 항목은 0으로 확정한다. 한 제출은 한 번만 처리(`already_reviewed`), 문제 수가 없으면 문항수 승인 불가(`problems_unknown`).
- **드래곤볼은 별개** — 숙제 승인은 드래곤볼 지급/출현 로직을 건드리지 않는다(승인해도 드래곤볼을 주지 않는다).
- `finish_session` 은 숙제 세션을 받으면 `close_homework_session` 으로 넘겨 기록에 바로 넣지 않는다(학원은 그대로). `auto_end_paused_session` 의 숙제 자동 종료도 승인 대기로 넘긴다.
- 사진은 **비공개 Storage 버킷 `homework-photos`**(1개 5MB·사진 형식만)에 올라가고 화면에서는 1시간짜리 **서명 URL** 로 본다.

### 문제 수 0~999 상한 · 학생이 오늘 학원 공부 문제 수 수정 (2026-11-23)
학생이 넣는 문제 수는 이제 **0~999** 까지만 받는다. 999를 넘겨 넣으면 저장되지 않고, 학생이 자기 **오늘 학원 공부 문제 수**는 직접 고칠 수 있다.

- **화면(키패드)** — 999 뒤에 한 자리 더 누르면 그 자리는 들어가지 않고 창 안에 `문제 수는 999개까지 넣을 수 있어요.` 가 노란 줄로 뜬다. 공부 종료 창(`오늘 푼 문제 수`·`숙제 공부 제출`), 다음 접속의 `지난번 푼 문제 수`, `오늘 학원 공부 문제 수` 수정 창이 모두 같은 규칙이다(`src/lib/pauseWatch.ts` 의 `appendProblemDigit`·`problemsFromInput`).
- **DB 안전장치** — `finish_session`·`set_session_problems`·`close_homework_session`·`submit_homework`·`submit_pending_homework` 는 999 밖의 값(1000·음수)을 `problems_out_of_range` 로 거부한다(앱은 이 코드를 `문제 수는 999개까지 넣을 수 있어요.` 로 보여 준다). 숙제 사진 초안 `save_homework_draft` 는 사진 올리기가 막히지 않도록 999로 **다듬기만** 한다.
- **관리자** — 실시간 탭 `수업 종료` 입력칸도 세션 단위로 999까지다. 하루 합산처럼 예외가 필요한 값은 예전처럼 `기록 수정`(LogEditorModal)에서 자유롭게 고친다.
- **✏️ 문제 수 수정 (학생)** — 오늘 학원 공부 기록(`academy_minutes` 또는 `academy_problems` 가 0보다 큼)이 있으면 학생 홈의 오늘 카드와 학원 공부 결과 화면에 `✏️ 문제 수 수정` 버튼이 생긴다.
  - 창(`오늘 학원 공부 문제 수`)에 지금 기록(`지금 기록 N문제`)과 `0~999문제까지 넣을 수 있어요. 고치면 오늘 문제 합계도 같이 바뀌어요.` 안내가 나오고, 키패드로 고친 뒤 `저장`(값이 그대로면 잠김)을 누르면 바로 반영된다.
  - **학원 공부 문제 수만** 바뀌고, 합계 `problems` 는 `academy_problems + homework_problems` 로 다시 계산된다. 숙제 공부 문제 수는 선생님 승인 대상이라 이 창에서는 바뀌지 않는다. 공부 시간(`minutes`)도 그대로다.
  - DB 함수 `student_update_today_academy_problems(student_id, problems)` 가 오늘(KST) `study_logs` 한 줄을 `for update` 로 잠그고 0~999 검증·합계 재계산을 한 번에 처리한다. 오늘 학원 공부가 없으면 `no_academy_today`, 오늘 기록 자체가 없으면 `log_not_found`.
  - 지난 날짜 기록은 이 창으로 고칠 수 없다(오늘만). 숙제만 한 날에도 학원 문제 수를 고칠 수 없다.

### 근두운 · 드래곤볼 (2026-11-21)

학생 홈의 오늘 공부 카드 아래에 두 카드가 붙습니다. 15초마다 새로 읽고, 그 사이에는 1초마다 시간만 흘려 보냅니다.

- **☁️ 근두운 (숙제 타이머)** — 숙제 공부 타이머 위쪽에 같은 현황을 한 줄로 줄여 띄운다(`N명 공부 중 · 이름 + 시간`). 홈 카드와 같은 `live_study_board()` 를 쓰고 15초마다 새로 읽는다.
- **☁️ 근두운 (홈)** — 지금 공부 중인 친구 수(`N명`), 공부 중인 친구들의 **닉네임 + 진행 시간**을 **작은 구름** 안에 넣어 위아래로 둥둥 떠다니게 보여 준다(`src/index.css` 의 `kintoun-bob`·`kintoun-drift`, 구름마다 박자를 조금씩 다르게). 모바일 폭에서는 구름이 줄바꿈되고, 이름이 길면 말줄임으로 줄인다. 잠깐 쉬는 친구는 구름 대신 `😴 잠깐 쉬는 중` 한 줄로 보여 준다.
- **🔥 실시간 연속 공부 순위** — 멈추지 않고 이어서 공부 중인 시간 기준 상위 5명(동점은 같은 순위), 내 순위는 `내 순위 N위 / M명` 으로 따로 표시하고 내 줄은 노란 배경.
- **닉네임** — `근두운에 보이는 내 이름` 옆 `바꾸기` 버튼(최대 10자, 비우면 `수련생`). 같은 이름이 둘 이상이면 `수련생 A · 수련생 B` 로 구분해 보여 준다.
- **🐉 내 드래곤볼 (1~7성구 도감, 2026-11-21)** — 선오공이가 쏜 드래곤볼은 **1성구~7성구**로 랜덤하게 나온다. 홈 카드는 **일곱 칸 도감**으로 보여 준다 — 모은 성구는 컬러 아이콘 + `×N` 배지, 아직 못 모은 성구는 흐리게(잠금) 표시하고, 위에 총 개수(`N개`)와 **`M/7종 수집`** 을 함께 띄운다. 보유 개수는 **제한 없이** 계속 쌓인다.
- **성구 아이콘** — `public/dragonballs/1.png` ~ `7.png` (256×256, 투명 배경). `tools/make_dragonballs.py` 로 다시 만들 수 있고, 별 개수·배치는 정식 드래곤볼 배치(1 가운데 · 2 위아래 · 3 삼각 · 4 네 귀퉁이 · 5 네 귀퉁이+가운데 · 6 두 줄 세 개씩 · 7 가운데+둘레 여섯)를 따른다.
  - 색은 **차분하게 톤다운한 뮤트 파스텔 무지개 7색 + 하얀 별** — 1 코랄레드 · 2 살구주황 · 3 버터옐로 · 4 세이지그린 · 5 더스티스카이 · 6 슬레이트네이비 · 7 라벤더퍼플. 별이 밝은 구슬에서도 세어지도록 별 테두리·그림자를 구슬의 진한 톤으로 그린다.
- **🐲 일반용 7종 · 🌈 무지개용 · 🎟 교환권 (2026-11-22)** — 2026-11-21 의 '무지개 볼' 은 없애고 **일반용 7종(빨간용·주황용·노란용·초록용·파란용·남용·보라용)** 과 **무지개용** 으로 바꿨다.
  - **성구 2개 → 사탕교환권 1장 — 쓸 성구 2개를 학생이 직접 고른다 (2026-11-22)** — 버튼(`사탕교환권 · 성구 2개 → 1장`)을 누르면 **성구 고르기 창**이 열린다.
    - 위의 두 칸에 고른 성구가 차례로 채워지고, 아래 1~7성구 도감에서 **가진 성구를 누를 때마다 한 개**씩 골라진다. 같은 성구를 두 번 누르면 **3성구 2개**처럼 같은 성구 2개도 고를 수 있고, 서로 다른 성구 2개(1성구 + 5성구)도 된다.
    - 가진 개수를 넘겨 고를 수 없다(그 칸은 `–`/흐리게). 고른 칸을 누르면 그 하나만 빠지고, `다시 고르기` 로 모두 지운다. 2개를 다 고르면 `2개를 다 골랐어요` 와 함께 `사탕교환권으로 바꾸기` 가 열린다.
    - 서버(`exchange_candy_ticket(p_student_id, p_stars integer[])`)가 **고른 성구 2개를 그대로 차감**하고 사탕교환권 1장을 늘린다. 2개가 아니거나 1~7성구가 아니면 `invalid_stars`, 가진 개수보다 많으면 `dragonballs_shortage` 로 거절하고 아무것도 바꾸지 않는다.
    - `p_stars` 없이 부르면(배포 중 열려 있던 예전 화면) 예전처럼 가장 많이 가진 성구부터 2개를 차감한다.
  - **1~7성구 하나씩 → 일반용 7종 중 랜덤 1마리** — `일반용 뽑기` 버튼(성구 7개가 빠진다). 태어나면 `새 일반용 탄생!` 모달에 그 색 일반용이 크게 뜬다.
  - **일반용 7종 하나씩 → 무지개용 1마리** — `무지개용` 버튼. 7색을 다 모으면 열리고, 누르면 `짜잔! 무지개용 등장!` 모달에 무지개 신룡(`public/dragonballs/shenron.png`, 배에 무지개 `訓`)이 나타난다.
  - **일반용 1마리 → 1,000포인트 교환권 1장**, **무지개용 1마리 → 10,000포인트 교환권 1장** — 되돌릴 수 없어서 한 번 더 확인하는 창을 띄운다.
  - **교환권은 학원에서 실제로 준 뒤 관리자가 사용 처리**한다(관리자 `실시간` 탭의 `🎟 교환권 지급 확인 · 사용 처리`). 학생 홈 위쪽에 `사탕교환권 · 1,000P · 10,000P` 장 수가 보인다.
  - **아이콘** — 일반용 7종은 무지개 신룡 그림의 색만 바꿔 **한 가족처럼 통일**했다(`public/dragonballs/dragon-red.png` ~ `dragon-purple.png`, `tools/make_color_dragons.py`). 무지개용은 기존 신룡 그림 그대로. 교환권 아이콘은 `ticket-candy.png` · `ticket-1000.png` · `ticket-10000.png`(같은 스크립트가 만든다).
  - **예전 데이터** — 만들어 둔 무지개 볼(`rainbow_ball_count`)은 같은 값(성구 7개)으로 만든 일반용 1마리로 옮기고 `rainbow_ball_count` 는 0 으로 정리한다(색은 학생 id 로 정해져 다시 실행해도 같다). 2026-11-22 이관에서 이지빈 학생의 무지개 볼 1개가 **노란용** 1마리가 됐다.
- **🖤 히든 검은용 · 시크릿쿠폰 (2026-11-22, 학생 화면에는 설명하지 않는다)** — 일반용이 태어날 때와 무지개용이 만들어질 때 **1/1,000 확률로 검은용이 '보너스'로 함께** 나온다. 원래 나온 일반용·무지개용은 그대로 남으므로 학생이 손해 보지 않는다.
  - 검은용은 **가진 학생에게만** 홈의 일반용 칸 옆에 `검은용 N마리` 로 보이고, `검은용 → 시크릿쿠폰` 버튼이 생긴다(검은용 1마리 = 시크릿쿠폰 1장). 검은용이 없는 학생 화면에는 관련 문구·확률·아이콘이 전혀 나오지 않는다(테스트로 확인).
  - 아이콘 `public/dragonballs/dragon-black.png` — 다른 7색과 같은 그림에 아주 어두운 색만 입혀 한 가족처럼 보인다. 시크릿쿠폰 아이콘은 `ticket-secret.png`.
  - 확률은 DB 함수 `roll_black_dragon()` 안에만 있고 **앱(anon)에는 실행 권한을 주지 않았다**. 학생·관리자 화면 어디에도 `1/1,000` 같은 안내를 쓰지 않는다.
  - 관리자 `실시간` 탭의 교환권 칸에서 **시크릿쿠폰도 사탕·1,000P·10,000P 와 똑같이** 보유 확인·사용 처리(차감)할 수 있다(가진 학생에게만 칩이 보인다). 사용 기록도 `ticket_uses` 에 `secret` 으로 남는다.
  - DB: `students.black_dragon_count`, `students.secret_tickets`, `exchange_secret_ticket()`, `use_ticket(..., 'secret')`, `roll_black_dragon()`.
  - 검증: `supabase/verify-2026-11-22-secret-black-dragon.sql` — 40만 번 표본으로 확률을 확인하고, `set_config('sunogong.force_black','on')` 으로 검은용이 함께 나오는지·원래 용이 남는지·시크릿쿠폰 교환·사용까지 확인한 뒤 검증용 학생을 지운다.
- **성구·일반용·교환권은 DB 에 따로 쌓인다** — `students.dragonballs`(`{"1":0,...,"7":0}`) 에 성구별 개수, `students.dragonball_count` 에 총합(합계는 항상 같도록 DB 제약), `students.dragons`(`{"red":0,...,"purple":0}`) 에 일반용, `students.rainbow_dragon_count` 에 무지개용, `students.candy_tickets`·`point_1000_tickets`·`point_10000_tickets` 에 교환권 장 수, `dragonball_grants.stars` 에 그때 나온 성구, `ticket_uses` 에 관리자가 사용 처리한 기록이 남는다.
- **실명은 밖으로 나가지 않는다** — 서버 함수 `live_study_board()` 가 `nickname · status · started_at · seconds · is_me · dragonballs(성구 맵) · dragons(일반용) · rainbow_dragon_count` 만 돌려준다(실명·학년·학생 id 없음). 닉네임을 정하지 않은 학생은 `수련생` 으로 보인다.

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
- **학원 공부(🏫)와 숙제 공부(🏠)를 따로 집계**: 대시보드 맨 위 **구분 `전체 / 🏫 학원 공부 / 🏠 숙제 공부`** 로 아래 표·통계를 한 번에 바꾼다(표·학생 비교·미제출 카드에도 같은 필터가 있어 스크롤 중에도 바로 바꿀 수 있다).
  - **요약 카드**: 학생 · 🏫 학원 공부 · 🏠 숙제 공부 · 합계 · 푼 문제 · 1인당 — 학원과 숙제를 항상 따로 보여주고, 푼 문제·1인당 카드는 고른 구분으로 계산한다.
  - **학생 × 날짜 표**: 고른 구분의 시간·문제만 칸에 보이고(다른 종류만 있는 날은 `–`), 합계 칸에는 고른 구분 합계 + 반대쪽과 전체 합계를 작게 함께 남긴다.
  - **학생별 요약(학년별)**: 학생마다 🏫 학원 · 🏠 숙제 · 합계 칸이 따로 있고, 고른 구분의 칸을 진하게 보여준다(학년 평균·문제·제출 일수도 그 구분 기준).
  - **학생 비교**: 공부시간/문제수 × 전체/학원/숙제로 골라 **학원만 · 숙제만 따로 순위를 매긴다**(전체일 때는 남색+보라 쌓인 막대, 구분을 고르면 그 색 한 줄).
  - **미제출 학생**: `기록 없음 N명 · 🏫 학원 미제출 N명 · 🏠 숙제 미제출 N명` 을 한 줄에 보여주고, 눌러서 그 명단을 본다.
  - **학생 상세(최근 30일)**: 학원·숙제 시간과 문제를 각각, 추이 그래프도 전체/학원/숙제로 바꿔 본다. CSV 두 종류에도 학원·숙제 칸이 모두 들어간다. 종류가 없던 예전 기록은 학원 공부로 본다.
- **실시간** (상단 탭, 예전 이름 `근두운`): 지금 공부 중인 학생을 **세 줄로** 보여 준다 — 1줄 `이름 + 닉네임`, 2줄 `공부 중/잠깐 쉬는 중 · 시간`, 3줄 배지(성구 `N개 M/7종`, 일반용 `N마리 · M/7색`, 무지개용이 있으면 🌈 개수). 오른쪽 끝은 **글자 없이 드래곤볼 아이콘만 있는 쏘기 버튼**(누르면 화면 위 `한 학생에게 N개` 만큼 쏜다, 접근성 이름은 `이름에게 드래곤볼 N개 쏘기`). 이 3줄 배치는 모바일 세로 화면(360~390px)에서 이름이 `김···` 으로 잘리지 않게 하려고 소민 님 제안을 반영한 것이다. 위쪽 카드에는 **지금 공부 중 N명을 `🏫 학원 N명 · 🏠 숙제 N명` 으로 따로** 센다. **선오공이 드래곤볼 쏘기** 로 **전체 일괄**(공부 중인 학생 전원, 원하면 `쉬는 중인 학생도 포함`) 지급을 하고, 한 번에 1~99개이며 **한 개마다 1~7성구가 랜덤**으로 나온다. 쏘면 드래곤볼이 위로 날아가는 애니메이션과 결과 문구(`4성구 · 7성구` 처럼 나온 성구)가 뜨고 아래 `드래곤볼 지급 이력`(최근 12건)에 남는다. 15초마다 새로 읽는다.
  - **⏹️ 수업 종료 (2026-11-23)** — 활성 세션 카드(학원·숙제 모두)의 배지 줄 오른쪽에 `수업 종료` 버튼이 있다. 누르면 확인 창이 떠서 **학생 이름·학원/숙제·공부 중/쉬는 중·지금까지의 시간**과 **오늘 푼 문제 수(선택, 비우면 0문제)** 를 보여 주고, `수업 종료` 를 다시 눌러야 마무리한다. 실수로 눌러도 취소할 수 있다.
    - **학원 공부**: 공부 중이면 지금 시각, 쉬는 중이면 멈춘 시각까지의 시간으로 `study_logs` 에 바로 들어간다(문제 수도 함께). 5시간 상한과 자정 넘김 규칙은 학생이 종료할 때와 똑같다.
    - **숙제 공부**: 기존 규칙대로 **승인 대기 제출**로 넘어간다 — 시간은 잡히고 문제 수는 입력한 값(비우면 0), 사진은 학생이 올려 둔 초안이 있으면 그대로 남는다. `숙제관리` 에서 확인해 승인하면 기록에 들어간다.
    - 이미 끝난 세션이면 **기록을 건드리지 않고** `이미 끝나 있었어요` 로 답한다(두 번 눌러도 안전). 끝낸 뒤에도 학생 화면은 멈추지 않고, 10초 안에 **`선생님이 수업을 마무리해서 타이머를 멈췄어요` 결과 화면**으로 저절로 바뀐다.
- **숙제관리** (상단 탭, 2026-11-23 · 승인 대기 건수 배지): 학생이 사진과 함께 낸 숙제 공부를 **한 명씩** 확인한다.
  - `승인 대기 / 승인 / 반려 / 전체` 로 거르고, 목록에 `이름 · 학년 · 날짜 · 시간·문제 수 · 사진 N장 · 승인 대기` 를 보여 준다. 승인 대기는 **오래된 것부터**(먼저 온 학생부터), 처리 내역은 최근 것부터.
  - 상세 창: 학생 이름, 날짜, **공부 시작·종료 시각**, 제출 공부 시간(분), 제출 문제 수, **숙제 사진 갤러리**(누르면 크게 보기 · 좌우 버튼·손가락 밀기·`1 / N` 로 넘기기).
  - **공부 시간 승인 / 반려(0)** · **문항수 승인 / 반려(0)** 를 따로 고르고, 원클릭 **`모두 승인` / `모두 반려`** 보조 버튼도 있다. 문제 수가 아직 없는 제출은 문항수를 승인할 수 없다(반려 = 0문제).
  - **반려 사유 메모**(학생에게 보임, 300자) + 빠른 선택 칩 `풀이 흔적 부족 · 답만 작성됨 · 사진 식별 불가`.
  - **👏 선생님 칭찬 한마디 (선택, 2026-11-23)** — 반려 사유 칸 위에 칭찬 문구 칩 `풀이가 꼼꼼해요 · 글씨가 깔끔해요 · 어려운 문제 잘 고민했어요 · 꾸준히 잘하고 있어요 · 스스로 잘 풀었어요` 와 직접 입력칸(최대 200자).
    - 칩을 누르면 입력칸에 그 문구가 들어가고 다시 누르면 빠진다 — 칩 여러 개나 직접 쓴 글과 섞어도 된다.
    - **비워 두면 한마디 없이 예전처럼 1탭 바로 승인**된다. 모두 반려할 때는 칸이 잠긴다(서버도 반려에는 저장하지 않는다).
    - 처리 완료(승인) 목록의 줄과 상세 창에도 `👏 한마디` 가 함께 보인다.
  - `확인(저장)` 을 누르면 승인한 항목만 그 날 `study_logs` 에 더해지고(통계·랭킹 반영), 반려한 항목은 0으로 확정된다. 저장 뒤 **다음 대기 학생으로 자동 이동**한다. 드래곤볼과는 별개다.
- **🎟 교환권 지급 확인 · 사용 처리** (실시간 탭): 교환권을 가진 학생을 많이 가진 순서로 보여 주고(이름으로 찾기 가능), `사탕 2` · `1,000P 1` · `10,000P 0` 처럼 학생별 장 수를 눌러 **한 장 사용 처리**한다. 누르면 `학원에서 실제로 지급한 뒤 눌러 주세요` 확인 창이 뜨고, 처리하면 `최근 사용 처리` 기록이 남으며 학생 목록도 바로 다시 읽는다.
- **질문함** (상단 탭, 답변 대기 건수 배지): 학생 질문을 **답변 대기 우선**으로 보고 `답변 대기 / 답변 완료 / 전체` 로 거른다. 사진을 눌러 크게 보고, **선오공이** 이름으로 답변 글 + 해설지 사진 또는 **훈노트 영상**(MP4·WebM·MOV, 50MB 이하)을 달거나 수정하고, 질문을 삭제(사진·영상 포함)할 수 있다.
  - **오래된 질문 자동 정리** — 질문함을 열 때 **답변 완료 후 7일**이 지난 질문과 Storage 사진·영상을 자동으로 지운다(끄기 스위치 있음, `지금 정리` 버튼도 있음). DB 줄만 지우지 않고 파일까지 지워서 무료 용량이 실제로 비워진다.
- **🔔 새 질문 알림** (질문함 맨 위 카드): 이 기기에서 알림을 **켜기/끄기**, 알림 받는 **기기 수**, **테스트 알림 보내기**.
  - 켜면 학생이 질문을 올릴 때마다 휴대폰에 `선오공 새 질문` 알림이 오고, 누르면 `/admin?tab=questions`(질문함)이 바로 열린다.
  - 기기마다 따로 켜야 한다(원장님 폰·태블릿 각각). 아이폰은 홈 화면에 추가한 선오공에서만 켤 수 있다(iOS 16.4+).
- **학생 관리 탭 없애고 「훈출」로 일원화** (2026-11-27): 관리자 탭에서 **`학생 관리` 를 뺐다**. 원생 추가·수정·삭제·학년·닉네임(근두운 닉네임 바꾸기·비우기)은 통합 앱 **「훈출」(`hoonmath-app`) → 원생·포인트** 한곳에서만 한다. 선오공에서는 **대시보드·실시간·랭킹·숙제관리·질문함** 에 학생 이름·학년·닉네임이 그대로 보이고, 대시보드 칸을 눌러 기록 수정/삭제하는 기능도 그대로다(`src/admin/StudentsPanel.tsx` 삭제, `?tab=students` 로 열던 길도 없어짐 — 알림 딥링크는 원래 `?tab=questions` 뿐).
- **모바일 좌우 스와이프로 탭 이동** (2026-11-21): 관리자 화면을 **왼쪽으로 밀면 다음 탭, 오른쪽으로 밀면 이전 탭**(대시보드 → 실시간 → 숙제관리 → 질문함 → 랭킹). 손가락이 **60px 넘게** 움직였고 **가로 이동이 세로 이동의 1.5배보다 클 때만** 탭이 넘어가서 세로 스크롤과 섞이지 않습니다. **입력창·선택 상자·글자 수정 영역, 모달·사진 확대, 가로로 넘치는 표**(탭 줄·표) 안에서는 표를 넘기는 동작이 우선이라 탭이 바뀌지 않습니다(두 손가락 확대도 제외). 판정은 `src/lib/adminSwipe.ts` 의 순수 함수, 화면 처리는 `AdminApp` 의 `onTouchStart`/`onTouchEnd`.
- **랭킹**: 이번 달(기본) / 지난달 / 월 선택 / 전체 누적, 학년 필터, **연속 공부 TOP3**, **공부시간은 `전체 공부시간`(학원+숙제) · `🏫 학원 공부` · `🏠 숙제 공부` 세 가지로 따로** TOP3, **🐉 드래곤볼 TOP3**(기간과 무관한 현재 보유 — **일반용 1마리 = 성구 7개, 무지개용 1마리 = 성구 49개**로 쳐서 정렬하고, 이름 옆에 `🐲 일반용 N마리(M/7색) · 🌈 무지개용 N마리`), **문제도 `문제 풀이`(학원+숙제) · `🏫 학원 문제` · `🏠 숙제 문제` 세 가지로 따로** TOP3. 관리자 랭킹은 `실명 + 학년 + 닉네임(있으면)` 으로 보여 주고, 동점은 같은 순위(제출 일수 많은 학생 먼저), **이미지로 저장**(html2canvas)

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
| 앱을 닫았다가 다시 열면 마지막 신호 시각까지로 일시정지 (**숙제 공부만** — 학원 공부는 2026-11-27 부터 멈추지 않는다) | 클라이언트 `isHeartbeatStale` + `pause_session` |
| **공부 중 '선오공에게 질문하기' 창을 여는 동안(카메라로 넘어간 시간 포함)에는 숙제 공부도 멈추지 않는다** | `holdOnLeave` — 창을 닫을 때 마지막 신호를 현재로 다시 맞춤 |
| 10초마다 마지막 신호 시각만 갱신 (서버가 임의로 멈추지 않게) | `study_sessions.last_heartbeat_at` 직접 갱신 |
| 일시정지 시간은 한 번만 뺀다 (멈춘 시각 = 마지막 신호면 그 뒤 시간은 이미 안 세므로 `paused_seconds` 를 또 더하지 않음) | `pause_session` |
| 1회 최대 5시간(300분), 넘으면 자동 종료 | 클라이언트 안내 + 서버 18,000초 상한 |
| **쉬는 지 30분 → `아직 공부 중인가요?` 알림창 + 진동·안내음·브라우저 알림** | 클라이언트 `pauseStage`·`alertPauseCheck` (`src/lib/pauseWatch.ts`, `src/lib/studentAlert.ts`) |
| **응답 없이 쉬는 시간 총 60분 → 자동 종료** (공부 시간은 쉬기 전까지, 문제 수는 비워 둔 채 `problems_pending`; 1분도 공부하지 않았으면 기록·질문 없음) | `auto_end_paused_session` |
| 자동 종료된 공부는 다음 접속 때 문제 수를 물어보고, 입력하면 그 날 기록에 더한다 | `pending_problem_sessions`, `set_session_problems` |
| **자정(00:00) 전에 종료를 누르지 않으면 기록하지 않고 버린다** | 클라이언트 자정 타이머 + `discard_session`, `reconcile_session` |
| 같은 종료 요청이 두 번 와도 기록이 두 번 쌓이지 않음 | `finish_session` 이 `finished` 상태를 먼저 확인 |
| **선생님이 실시간 탭에서 「수업 종료」** — 공부 중이면 `now()`, 일시정지 중이면 `paused_at` 까지로 정산(5시간 상한·자정 넘김 규칙은 그대로) | `admin_end_study_session` → `finish_session`(학원) · `close_homework_session`(숙제, 승인 대기) |
| **학생 기기가 타이머에 머물러 있어도 선생님 종료를 알아챈다** — 10초마다 상태를 읽어 `finished` 면 결과 화면으로, 화면을 다시 켜면 바로 확인 | `study_session_state` + `useStudyTimer` 의 종료 확인(10초·화면 복귀 시) |

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
│  ├─ migrate-2026-11-21-dragonball-stars.sql   # 1~7성구 도감(성구 맵·랜덤 지급·지급 이력)
│  ├─ migrate-2026-11-21-rainbow-ball.sql       # (지난 규칙) 무지개 볼 — 지금은 아래 파일이 대신한다
│  ├─ migrate-2026-11-22-color-dragons-tickets.sql  # 일반용 7종·무지개용·교환권·사용 처리
│  ├─ migrate-2026-11-22-candy-pick-stars.sql       # 사탕교환권 — 쓸 성구 2개를 직접 고르기
│  ├─ migrate-2026-11-22-secret-black-dragon.sql    # 히든 검은용·시크릿쿠폰
│  ├─ migrate-2026-11-23-homework-photo-approval.sql  # 숙제 사진 인증·시간/문항수 승인·Storage homework-photos
│  ├─ migrate-2026-11-23-homework-photo-resume.sql    # 숙제 사진 초안(탭이 튕겨도 이어서 제출)
│  ├─ migrate-2026-11-23-homework-teacher-comment.sql # 승인 때 「선생님 칭찬 한마디」(teacher_comment)
│  ├─ migrate-2026-11-23-admin-end-study.sql        # 관리자 「수업 종료」·학생 기기의 종료 확인(ended_by_admin)
│  ├─ verify-2026-11-22-secret-black-dragon.sql     # 검은용 확률·보너스·교환 검증(되돌림)
│  ├─ verify-2026-11-22-candy-pick-stars.sql        # 사탕교환권 성구 고르기 검증(되돌림)
│  ├─ verify-2026-11-23-homework-teacher-comment.sql # 칭찬 한마디 저장·200자·반려·예전 호출 검증(되돌림)
│  └─ verify-2026-11-21-kintoun-dragonball.sql   # 근두운·드래곤볼 SQL 검증(되돌림)
├─ tools/make_placeholders.py # 자리표시자 이미지 생성(선택)
├─ tools/lib-test.ts          # 날짜·집계·랭킹·타이머·기기 판별·질문(Q&A)·알림·성구 도감·스와이프 계산 테스트(개발용)
├─ tools/make_dragonballs.py  # 1~7성구 아이콘(public/dragonballs/1~7.png) 생성 스크립트
├─ tools/make_color_dragons.py # 일반용 7종(색만 바꾼 신룡) + 교환권 아이콘 생성 스크립트
├─ tools/e2e-color-dragons-tickets.mjs # 일반용·무지개용·교환권 실서비스 E2E(검증용 학생은 끝나고 삭제)
├─ tools/e2e-candy-pick-stars.mjs # 사탕교환권 성구 고르기 실서비스 E2E(검증용 학생은 끝나고 삭제)
├─ tools/make_mascot.py       # 마스코트 → 전신·얼굴·앱 아이콘·og-image 생성 스크립트
├─ tools/make_shenron.py      # 무지개 신룡 → public/dragonballs/shenron.png
├─ tools/ssr-smoke.tsx        # 모든 화면 렌더 확인(개발용)
├─ tools/check-login-quotes.mjs # 배포된 로그인 화면 360px — 오늘의 한줄 카드 표시·눌러도 그대로·새로 열면 무작위 + 스크린샷(개발용)
├─ tools/e2e-homework-approval.mjs # 숙제 사진 제출·시간/문항수 승인 실서비스 E2E(검증용 학생은 끝나고 삭제)
├─ tools/e2e-homework-draft.mjs    # 숙제 사진 초안(사진 1장씩 저장·이어서 제출·자동 종료·정리) 실서비스 E2E
├─ tools/e2e-homework-praise.mjs   # 승인 칭찬 한마디(저장·학생 목록·200자·반려·예전 호출) 실서비스 E2E
├─ tools/e2e-admin-end-study.mjs   # 관리자 「수업 종료」 실서비스 E2E(학원·숙제·일시정지·두 번 누름·자정 넘김·실제 세션 무사고)
├─ tools/check-admin-end-study.mjs # 배포된 관리자 실시간 탭 360px — 「수업 종료」 버튼·확인 창·학생 화면 전환 + 스크린샷
├─ tools/check-homework-ui.mjs  # 배포된 화면 360px — 학생 숙제 제출 창·홈 승인 표시·관리자 숙제관리 상세 + 스크린샷(개발용)
└─ src/
   ├─ main.tsx, App.tsx, index.css
   ├─ lib/                    # supabase.ts, api.ts, time.ts, session.ts, stats.ts, logEdit.ts(기록 수정 계산), grades.ts, csv.ts, device.ts, types.ts,
   │                          # questions.ts(Q&A DB·Storage), questionBoard.ts(질문 순수 함수), imageCompress.ts(사진 줄이기),
   │                          # push.ts(알림 켜기/끄기·구독 저장), pushBoard.ts(알림 순수 함수·VAPID 공개 키),
   │                          # kintoun.ts(근두운·드래곤볼·일반용·교환권 DB 함수), kintounBoard.ts(근두운 순수 함수 — 닉네임·순위·구름·성구·일반용·교환권),
   │                          # adminSwipe.ts(관리자 좌우 스와이프 탭 이동 판정 — 거리·기울기·예외 영역),
   │                          # pauseWatch.ts(쉬는 시간 30분·60분 판정과 문제 수 입력 순수 함수), studentAlert.ts(진동·안내음·브라우저 알림),
   │                          # quotes.ts(학생 코드 입력 화면의 「오늘의 한줄」 124개 · 무작위로 하나 고르는 pickQuote),
   │                          # homework.ts(숙제 제출 DB·Storage), homeworkBoard.ts(숙제 제출 순수 함수 — 사진 수·상태·승인 결과·대기 합치기),
   │                          # photoPick.ts(사진 고르기 순수 함수 — 바로 찍기/앨범 버튼 이름·5장 합치기·사진 여부),
   │                          # homeworkPhotos.ts(숙제 사진 초안 순수 함수 — 항목·경로·문제 수 변환·다시 열기 판단)
   ├─ components/             # ErrorBoundary, Brand(마스코트·로고·푸터), Keypad, Modal, ImageViewer(사진 확대), PhotoPager(사진 좌우 넘기기), InstallBanner, DesktopBlockScreen(PC 안내), KintounCloud(구름·드래곤볼),   │                          # QuoteCard(오늘의 한줄 카드 — 화면을 열 때 무작위 한 개, 누를 수 없음),
   │                          # PhotoInputButton(사진 고르기 버튼 — 누를 수 있는 투명 input 을 버튼 위에 겹쳐 안드로이드에서 몇 번을 다시 눌러도 카메라·앨범이 열린다)
   ├─ student/                # StudentApp, CodeEntry, ChooseStudent, Home, Timer, Result, useStudyTimer,
   │                          # HomeworkSubmissionRow(숙제 제출 한 줄 — 반려 사유·👏 선생님 한마디 민트 박스),
   │                          # QuestionBoardScreen(질문 화면), QuestionAskForm(질문 올리기 폼), LiveKintounCard(근두운·내 드래곤볼·일반용·교환권), CandyPickModal(사탕교환권 성구 고르기),
   │                          # PendingProblemsModal(지난번 푼 문제 수·지난 숙제 제출)·usePendingProblems(대기 목록),
   │                          # HomeworkPhotoPicker(숙제 사진 고르기 — 📷 바로 찍기(capture=environment·한 장) + 🖼️ 앨범에서 고르기(multiple), 합쳐서 5장·미리 보기),
   │                          # useHomeworkPhotos(사진을 고르는 즉시 1장씩 줄여 업로드 + DB 초안 저장·되살리기)
   └─ admin/                  # AdminApp, AdminLogin, Dashboard, RankingPanel, QuestionsPanel(질문함), PushNotifyPanel(알림 설정), KintounPanel(실시간 탭·드래곤볼 쏘기·수업 종료), LiveSessionRow(지금 공부 중 한 줄 — 쏘기·수업 종료 버튼), EndStudyModal(수업 종료 확인 창), HomeworkPanel(숙제관리), PraiseEditor(선생님 칭찬 한마디 칩·입력), StudentDetailModal(학생별 기록), Charts, 모달들
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
  **근두운은 `live_study_board()` 함수가 닉네임·시간·성구 개수만 돌려주므로 화면에는 실명이 나가지 않지만, anon 키를 아는 사람이 표를 직접 읽으면 학생 이름을 볼 수 있는 것은 예전과 같습니다.** 완전히 가리려면 Supabase Auth(학생·교사 계정)로 바꿔야 하며, 그 작업은 이어서 할 수 있습니다.
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

# 4-2) 일반용·무지개용·교환권 실서비스 E2E (앱과 같은 anon 키로 실제 Supabase 에 붙음)
#     node tools/e2e-color-dragons-tickets.mjs

# 4-3) 히든 검은용·시크릿쿠폰 검증 (확률 표본·강제 보너스·교환·사용, 검증용 학생은 삭제)
#     Supabase SQL Editor 에 supabase/verify-2026-11-22-secret-black-dragon.sql 을 붙여넣고 실행

# 4-4) 사탕교환권 성구 고르기 SQL 검증 (같은 성구 2개·서로 다른 2개·잘못된 고르기·예전 호출, 검증용 학생은 삭제)
#     Supabase SQL Editor 에 supabase/verify-2026-11-22-candy-pick-stars.sql 을 붙여넣고 실행

# 4-5) 사탕교환권 성구 고르기 실서비스 E2E (앱과 같은 anon 키, 검증용 학생은 끝나고 삭제)
#     node tools/e2e-candy-pick-stars.mjs

# 4-6) 숙제 승인 칭찬 한마디 SQL 검증 (승인 저장·200자·모두 반려·예전 호출, 검증용 학생은 삭제)
#     Supabase SQL Editor 에 supabase/verify-2026-11-23-homework-teacher-comment.sql 을 붙여넣고 실행

# 5) 쉬는 시간 30분·60분 자동 종료 실서비스 확인 (앱과 같은 anon 키로 실제 Supabase 에 붙음)
#    시작 → 일시정지 → 61분 전에 멈춘 것으로 옮김 → 자동 종료 → 문제 수 입력 → 되돌리기
node tools/e2e-pause-autoend.mjs

# 6) 숙제 사진 제출·시간/문항수 분리 승인 실서비스 E2E (검증용 학생은 끝나고 삭제)
#    제출(사진 필수·5장 제한) → 기록에 바로 안 들어감 → 시간만/문항만/모두 반려 승인 →
#    기록에 승인분만 반영 → 드래곤볼은 지급하지 않음 → 60분 자동 종료 뒤 문제 수·사진 채우기 → 학원 공부는 그대로
node tools/e2e-homework-approval.mjs

# 6-2) 숙제 사진 초안(탭이 튕겨도 이어서 제출) 실서비스 E2E — 검증용 학생은 끝나고 삭제
#      초안 저장(사진 1장씩) → 목록에 안 보임 → 제출하면 초안이 제출로 → 60분 자동 종료가 초안의 사진·문제 수를 살림 →
#      같은 세션 두 번 제출해도 한 줄 → 초안 지우기 → 1분 미만은 남길 것 없음 → 세션 삭제 시 초안 정리
node tools/e2e-homework-draft.mjs

# 6-3) 숙제 승인 「선생님 칭찬 한마디」 실서비스 E2E — 검증용 학생은 끝나고 삭제
#      승인+칭찬 저장 → 학생 목록에 그대로 → 칩 여러 개 → 예전 4개 인자 호출 → 모두 반려면 미저장 →
#      200자 초과 거절 → 공백만 null → 두 번 처리 거절 → 기록·드래곤볼 그대로
node tools/e2e-homework-praise.mjs

# 6-4) 관리자 「수업 종료」 실서비스 E2E — 검증용 학생은 끝나고 삭제
#      공부 중 25분 → 7문제로 종료 → 기록·두 번 누름·일시정지 세션(paused_at 기준) → 숙제는 승인 대기 →
#      숙제 30초·0문제 → 자정 넘김 → 없는 세션 → 실제 운영 세션은 그대로
node tools/e2e-admin-end-study.mjs

# 6-5) 지난 날짜 미종료 세션 자동 정리 — SQL 검증(운영 DB) + 실서비스 E2E(검증용 학생은 끝나고 삭제)
#      Supabase SQL Editor 에 supabase/verify-2026-11-23-stale-session-cleanup.sql 을 붙여넣고 실행
#      미리보기·정산(25분)·폐기·숙제 승인 대기(30분)·오늘 세션 그대로·두 번째 0건·안전장치 null
node tools/e2e-stale-session-cleanup.mjs

# 7) 배포된 화면 360px 확인 + 스크린샷 (학생 숙제 제출 창·홈 승인 표시·관리자 숙제관리 상세)
node tools/check-homework-ui.mjs https://sunogong.vercel.app /workspace/downloads

# 7-2) 배포된 관리자 실시간 탭 360px — 「수업 종료」 버튼·확인 창·학생 화면 자동 전환 + 스크린샷
node tools/check-admin-end-study.mjs https://sunogong.vercel.app /workspace/downloads
```

결과: 단위 테스트 전부 통과(**509건** — 날짜·집계·학원/숙제 분리 집계·기록 수정 계산·비율·랭킹·타이머(경과·쉬는 시간·자동 종료 단계)·기기 판별·질문(Q&A)·알림(VAPID 키·기기 판별·구독 저장 모양·오류 문구)·근두운(닉네임·시간·구름·실시간 순위·타이머 근두운 줄·드래곤볼) 계산, 랭킹 전체/학원/숙제 분리·드래곤볼 순위·동점 처리, **일반용 7종(색 맵·총 마리·모은 색·도감·뽑기 조건)·무지개용 합성 조건·교환권(사탕·1,000P·10,000P 개수와 문구)·드래곤볼 힘(일반용=성구 7개, 무지개용=성구 49개)**·통계 구분(전체/학원/숙제 — 학생별·하루 기록·미제출 명단), 관리자 좌우 스와이프 42건(60px·1.5배 기준, 첫/끝 탭, 입력창·모달·가로 스크롤 예외, 컨테이너 바깥 무시), 문제 수 대기 목록·지난 공부 표시·자동 종료 안내 문구, **「오늘의 한줄」 124개·모든 명언의 출처·문구 중복 없음·무작위 번호 범위(난수 0·1·범위 밖·NaN)·124개 전부 고를 수 있음·1,001번 범위 확인 15건·사진 초안 19건**), **35개 화면** + 일반용 뽑기·무지개용 합성·사탕교환권·포인트 교환권 버튼, 관리자 교환권 사용 처리 칸·이름 찾기·일반용/무지개용 안내, 통계 구분 필터·실시간 학원/숙제 인원·일시정지 중 타이머·지난번 푼 문제 수 창까지 렌더 성공(스모크 176건 — 코드 입력 화면의 오늘의 한줄 카드 7건 포함)(관리자 알림 카드·근두운 패널·세션 넘긴 근두운 줄 포함), `schema.sql`/`seed.sql`/`migrate-2026-11-21-questions.sql`/`migrate-2026-11-21-push.sql`/`migrate-2026-11-21-kintoun-dragonball.sql`/`migrate-2026-11-21-dragonball-stars.sql`/`migrate-2026-11-21-rainbow-ball.sql`/`migrate-2026-11-22-pause-autoend.sql`/`migrate-2026-11-22-color-dragons-tickets.sql`/`migrate-2026-11-22-secret-black-dragon.sql`/`migrate-2026-11-23-homework-photo-approval.sql`/`migrate-2026-11-23-homework-photo-resume.sql`/`migrate-2026-11-23-homework-teacher-comment.sql`/`migrate-2026-11-23-admin-end-study.sql`/`migrate-2026-11-23-problems-limit-student-edit.sql` 문법 오류 없음, 근두운 SQL 검증 7건 통과, **검은용 SQL 검증 통과**(40만 번 표본 확률·강제 보너스·원래 용 유지·시크릿쿠폰 교환·사용), **쉬는 시간 자동 종료 실서비스 E2E 23건 통과**, **관리자 「수업 종료」 실서비스 E2E 49건 통과**, **일반용·무지개용·교환권·검은용 실서비스 E2E 49건 통과**(21개 지급 → 성구 2개 → 사탕교환권 → 1~7성구 → 일반용 랜덤 → 7종 → 무지개용 → 1,000P·10,000P 교환권 → 관리자 사용 처리·두 번 사용 거절·사용 기록·검은용→시크릿쿠폰·시크릿쿠폰 사용 처리·앱에서 확률 함수를 부를 수 없음·예전 함수 이름 호환까지). 검증 데이터는 되돌려 남은 검증용 학생·세션·기록 0건입니다.
배포 뒤 실제 화면에서도 확인했습니다 — **관리자 360px·390px**: `김민수 열공몬 / 공부 중 · 53:21 / 5개 4/7종 · 2마리 2/7색` 처럼 세 줄이 잘리지 않고 나오고 오른쪽 끝에 드래곤볼 아이콘만 있는 쏘기 버튼이 있습니다(스크린샷 `browser/sunogong-admin-live-list-360-*.png`, `...-390-*.png`). **교환권 사용 처리**: 시크릿쿠폰 1장을 눌러 확인 창 → `사용 처리` 로 0장이 되고 `ticket_uses` 에 `secret` 1줄이 남으며 칩이 사라지는 것까지 확인했습니다(9건, `browser/sunogong-admin-ticket-used-390-*.png`). **학생 홈 360·390px**: 교환권·성구 도감·일반용 7종·무지개용·검은용(가진 학생만)이 한 화면 폭에서 읽히고(`browser/sunogong-student-dragons-360-*.png` 등), 검은용이 없는 학생 화면에는 `검은용`·`시크릿쿠폰`·확률 문구가 하나도 없습니다(5건, `browser/sunogong-student-dragons-noblack-390-*.png`). 검증용 학생·세션·기록은 모두 지워 남은 검증 데이터 0건입니다.
화면 점검에는 `선오공에게 질문하기` 홈·타이머 버튼, 학생 질문 화면, 질문 올리기 폼, 관리자 질문함(자동 정리 안내 포함), 관리자 상단 탭 이름(`실시간`)과 **탭 다섯 개(대시보드·실시간·숙제관리·질문함·랭킹)에 `학생 관리` 가 없는지**, 숙제 타이머의 근두운 줄(학원 타이머에는 없음), 학생 홈의 `7색 드래곤` 대신 **`일반용`·`무지개용`·교환권** 표기가 모두 들어 있습니다. `'무지개 볼'` 표현은 홈·관리자 화면에서 모두 사라졌는지도 테스트로 확인합니다.

**「오늘의 한줄」(2026-11-22)** — 배포한 `https://sunogong.vercel.app`(새 번들 `index-Crg0DN7A.js`) 를 360×780 으로 열고 `node tools/check-login-quotes.mjs` 로 확인했습니다(17건 통과). 카드 라벨은 `오늘의 한줄` 이고 오른쪽의 `눌러서 바꾸기` 문구는 사라졌으며, 카드는 `<div>` 라 **20번 탭해도 명언이 그대로**였습니다(바뀐 횟수 0). 새로 열 때마다 무작위로 한 개가 나와 **12번 새로 열었을 때 11종**이 나왔고, 문구와 출처(`— 이름 (작품)`)가 함께 보입니다. 키패드 `1`·`0`·확인·카드·관리자 버튼이 모두 화면 안에 들어와 잘리지 않았고(문서 높이 780 = 화면 높이), 더 작은 **360×640** 브라우저 화면에서도 키패드·확인·카드는 잘리지 않았습니다(설치 안내 배너와 푸터만 아래로 조금 넘칩니다). 스크린샷 `downloads/sunogong-login-quotes-360.png`.

**숙제 공부 사진 인증 · 시간/문항수 승인 (2026-11-23)** — 단위 테스트 **43건**을 더해 **445건** 전부 통과했고, 스모크는 **28개 화면·140건**(숙제 제출 창, 지난 숙제 제출 창, 사진 고르기, 사진 좌우 넘기기, 관리자 숙제관리, 승인 대기 결과 화면, 관리자 탭 6개 이름)까지 렌더됩니다. `migrate-2026-11-23-homework-photo-approval.sql` 과 `schema.sql` 은 PostgreSQL 파서 검사와 **운영 DB(`qdzlenhmhszdsnygslhp`) 실행**을 모두 통과했고, `schema.sql` 전체를 다시 실행해도 결과가 같습니다.
실서비스 E2E(`node tools/e2e-homework-approval.mjs`, 43건)로 확인한 것: 문제가 있는데 사진이 없으면 `photo_required`, 사진 6장은 `too_many_photos`, 사진 1장과 함께 낸 40분·30문제가 **기록에 바로 들어가지 않고** 승인 대기로 남음, 시간만 승인 → `homework_minutes 40 · homework_problems 0`, 문항수만 승인 → `homework_minutes 40 · homework_problems 7`, 모두 반려 → 변화 없음, 같은 제출 두 번 처리 거절, 60분 자동 종료 → `submitted_problems NULL` 로 대기 → 다음 접속 때 12문제·사진 채우기 → 승인 시 9분·12문제만 더해짐, 5시간 초과 자동 종료 경로(300분으로 잘려 승인 대기), 학원 공부는 `academy_minutes` 로 즉시 반영되고 제출 줄이 생기지 않음, **드래곤볼은 어떤 경우에도 지급되지 않음**(`dragonball_count` 0·`dragonball_grants` 0줄), 사진 서명 URL로 열람. 검증용 학생·세션·기록·사진은 모두 지워 **남은 검증 데이터 0건**입니다.
배포한 `https://sunogong.vercel.app`(새 번들 `index-Bv6NOIRq.js`)를 360×780 으로 열어 `node tools/check-homework-ui.mjs` 로 39건을 확인했습니다 — 학생: 숙제 타이머 → 종료 → `숙제 공부 제출` 창(확정 안내 문구·`공부한 페이지 사진 0/5`·`제출`) → 사진 1장 담기·미리 보기 → 30문제 입력 → 제출 → `제출했어요 — 선생님 확인을 기다려요`, 홈 `숙제 제출` 카드 `승인 대기`; 관리자: 상단 탭 `숙제관리` **배지 1**, 목록 `검증화면 · 11/23 · 25분 · 30문제 · 사진 1장`, 상세(학생·날짜·`시작 07:59 · 끝 08:24`·25분·30문제·사진 크게 보기 `1 / 1`·`모두 승인`/`모두 반려`·반려 사유 칩) → `확인(저장)` → `승인했어요`, 기록 `25분·30문제` 반영, 드래곤볼은 그대로 0, 홈은 `승인` 표시. 화면이 잘리지 않았고, 검증용 학생·기록·사진은 지워 남은 데이터 0건입니다.
스크린샷: `downloads/sunogong-homework-submit-360.png`(학생 제출 창), `downloads/sunogong-homework-student-status-360.png`(승인 대기), `downloads/sunogong-homework-admin-list-360.png`(숙제관리 탭·배지), `downloads/sunogong-homework-admin-detail-360.png`(상세 확인), `downloads/sunogong-homework-admin-approved-360.png`(승인 뒤), `downloads/sunogong-homework-student-approved-360.png`(홈 승인 표시).

**숙제 사진 — 📷 바로 찍기 분리 · 다시 열리지 않던 문제 (2026-11-23)** — 원장님이 실기기(안드로이드)에서 제보한 두 가지를 고쳤습니다.
1. **바로 찍기**: 사진 고르기가 `📷 바로 찍기`(`<input type="file" accept="image/*" capture="environment">`, `multiple` 없음 — 폰 기본 카메라가 바로 열림)와 `🖼️ 앨범에서 고르기`(`<input type="file" accept="image/*" multiple>`) 두 버튼으로 나뉘었습니다. 두 버튼을 합쳐 5장까지이고, 5장을 다 담으면 두 버튼이 잠기며 `5장을 다 담았어요. 바꾸려면 사진 위 ✕를 눌러 빼주세요.` 로 안내가 바뀝니다.
2. **뒤로가기·앱 전환 뒤 사진 선택기가 다시 안 열리던 문제**: 원인은 ① `display:none` 인 input 을 `ref.click()` 로 여는 방식(안드로이드 크롬·PWA에서는 카메라·앨범을 다녀오거나 뒤로가기로 돌아온 뒤 '사용자 동작'이 없는 클릭으로 보여 선택기가 다시 열리지 않음), ② 고르지 않고 닫으면 input 값이 그대로 남아 같은 사진을 다시 골라도 `change` 가 오지 않던 것, ③ 사진 버튼이 타이머의 `busy`(일시정지·종료 요청)에 함께 잠겨, 앱을 벗어나 있는 사이 요청이 멎으면 버튼이 계속 잠겨 있던 것이었습니다.
   고친 방식: `src/components/PhotoInputButton.tsx` — 누를 수 있는 투명 input(`opacity-0`, `display:block`)을 버튼 위에 그대로 겹쳐 손가락이 input 에 바로 닿게 했고(진짜 사용자 동작), 누를 때마다 `value` 를 비우며(`FileList` 는 먼저 배열로 옮긴 뒤 비움), 화면으로 돌아올 때(`focus`·`pageshow`·`visibilitychange`)도 값을 비우고 뒤로가기로 되살아난 화면(bfcache)이면 input 을 새로 만듭니다. 사진 버튼은 이제 사진을 올리는 동안(`uploading`)에만 잠깁니다. 같은 방식을 `선오공에게 질문하기` 사진 버튼(`📷 사진 찍기`·`🖼️ 앨범에서`·`다시 고르기`)에도 적용했습니다.
검증: 단위 **455건**(사진 고르기 10건 — 버튼 이름·남은 자리·5장 합치기·사진 아닌 파일 제외), 스모크 **144건**(두 버튼 이름, 카메라 `capture="environment"`·`multiple` 없음, 앨범 `multiple`, input 이 `opacity-0` 오버레이인지) 전부 통과, `npm run build` 통과. 배포한 `https://sunogong.vercel.app`(새 번들 `index-BPkdzr1H.js`)를 360×780 으로 열어 `node tools/check-homework-ui.mjs` **55건** 통과 — 두 버튼이 32~327px 안에 나란히(카메라 44px·앨범 42px 높이) 잘리지 않고, 앨범 버튼을 **세 번 다시 눌러도 3/3 열리고** 바로 찍기도 2/2 열리며, 5장을 담으면 5/5·두 버튼 잠김·안내 문구가 바뀌고 하나를 빼면 다시 열립니다. 질문 창의 두 버튼도 실제로 파일 선택기가 열립니다. 검증용 학생·기록·사진은 지워 남은 데이터 0건입니다.
스크린샷: `downloads/sunogong-homework-picker-empty-360.png`(0/5 두 버튼), `downloads/sunogong-homework-picker-full-360.png`(5/5 잠김), `downloads/sunogong-homework-picker-360.png`(1/5 미리 보기).

**숙제 사진 — 카메라 전환으로 탭이 튕겨도 이어서 제출 (2026-11-23)** — 원장님이 실기기(안드로이드)에서 제보한 `사진찍기로 2장 정도 올리니까 튕겨나가고, 다시 접속하니 사진 못 올리고 종료됨` 을 원인부터 고쳤습니다.

1. **왜 튕겼나**: 안드로이드 크롬에서 `<input capture="environment">` 로 폰 카메라 앱을 열면 OS 가 배경 탭을 메모리에서 회수해 **페이지를 강제 새로고침**합니다. 그 위에 사진을 줄일 때마다 `createImageBitmap(file)` 이 **12~50MP 원본을 통째로 디코딩**(수백 MB)했고, 미리 보기 `<img>` 도 **원본 파일 주소**를 써서 화면을 그릴 때마다 원본을 다시 열었습니다. 사진 2장째에서 그 두 가지가 겹쳐 탭이 죽었습니다.
2. **왜 다시 접속하면 사진을 못 올렸나**: 사진·문제 수가 **React 상태에만** 있었고, 종료 창을 열 때 타이머는 이미 일시정지된 상태라 새로고침 뒤에는 **일시정지된 타이머 화면 + 빈 제출 창**으로 돌아왔습니다. 남은 길은 사진 없이 0문제로 내는 것뿐이었고, 그러면 `1분 미만 · 0문제` 는 `nothing` 으로 기록에 남지 않아 `종료됨` 처럼 보였습니다.
3. **1분 미만 확인 결과**: 세션 줄은 **버려지지 않습니다**(`study_sessions` 는 `finished` 로 남음). 다만 `close_homework_session` 규칙상 **0분 + 0문제**면 승인할 것이 없어 `nothing` 으로 끝나고 제출 줄도 사진도 남지 않습니다. 문제 수를 1개라도 적으면 **0분이어도 제출 줄(사진 포함)이 만들어집니다**. 화면에도 `1분이 안 돼서 공부 시간은 0분이에요 · (1분도 안 됐고 문제 수도 0이면 기록에 남지 않아요)` 라고 미리 알려 주고, 결과 화면에는 `기록에는 남기지 않았어요` 가 뜹니다.

고친 방식
- **사진을 고르는 즉시 1장씩** 줄여서(큰 파일은 `createImageBitmap(file, { resizeWidth: 1200, resizeQuality: 'medium' })` 로 **디코딩 단계에서 축소**, 작은 파일·세로로 긴 사진은 따로 처리) 바로 Storage 에 올리고, 그 경로와 입력 중인 문제 수를 **DB 초안**(`homework_submissions.draft_active`)에 저장합니다. 업로드·압축은 **한 장씩 차례로**(동시에 두 장을 열지 않음) 하고, 캔버스(`width=0`)·비트맵(`close()`)·미리 보기 주소(`revokeObjectURL`)는 쓰자마자 풉니다. 미리 보기도 **줄인 사진**으로 그립니다.
- 종료 창을 열면 초안에 `draft_open=true` 를 적어 두고, **탭이 튕겨 다시 접속하면** 그 초안을 읽어 `숙제 공부 제출` 창을 **사진·문제 수 그대로 다시 열어 줍니다**(서명 URL 로 미리 보기). 이어서 찍거나 바로 제출하면 됩니다.
- 초안 줄이 있어도 **세션이 제대로 마무리**되도록 `close_homework_session` 을 고쳤습니다(예전에는 제출 줄이 있으면 세션을 마무리하지 않고 `이미 제출` 로 돌아가 시간이 사라질 수 있었습니다). 같은 세션을 두 번 제출해도 한 줄이고, 60분 자동 종료는 초안의 사진·문제 수를 살립니다.
- 초안 줄은 **관리자 숙제관리·승인 배지·학생 제출 목록에 보이지 않고**, 사진을 ✕로 빼면 그 파일도 Storage 에서 지웁니다. 세션이 지워지면(자정 넘김 등) 그 세션의 초안도 트리거로 정리합니다.

검증
- 단위 **474건**(+19 — 사진 초안 항목·경로·문제 수 변환·다시 열기 판단), 스모크 **152건·31개 화면**(사진 올리는 중/실패 표시, 두 장 미리 보기) 통과, `npm run build` 통과. 새 마이그레이션은 PostgreSQL 파서 검사와 **운영 DB(`qdzlenhmhszdsnygslhp`) 실행**을 통과했습니다.
- 실서비스 E2E `node tools/e2e-homework-draft.mjs` **37건** 통과: 초안 저장(사진 1장·문제 12개) → 목록·배지에 안 보임 → 사진 추가 → 창 닫기 표시 → 제출하면 초안이 제출로(25분·12문제·사진 2장, 중복 없음, 세션 마무리) → 두 번 제출해도 한 줄 → 60분 자동 종료가 초안의 사진·문제 수를 살림 → 초안 지우기(진짜 제출 줄은 안 지움) → 1분 미만·0문제는 `nothing` 이고 초안 정리 → 세션 삭제 시 초안 정리 → 초안 사진은 5장까지. 검증 데이터는 모두 지워 남은 학생·제출·사진 0건입니다.
- 배포한 `https://sunogong.vercel.app`(새 번들 `index-C4y17ERH.js`)에서 원장님이 겪은 순서 그대로 확인했습니다: 숙제 타이머 → `종료` → `마칠래요` → **사진 1장(4000×3000·1.5MB)을 고르자마자 Storage 업로드 + 초안 저장**(186KB로 줄어듦) → **페이지를 새로고침해 다시 들어오자 `숙제 공부 제출` 창이 사진 `1/5` 그대로 다시 열림** → 사진 2장째 추가(초안에 두 장) → `30` 입력 → `제출` → 승인 대기 `25분 · 30문제 · 사진 2장`, 초안 표시 해제 · 기록에는 아직 미반영. 관리자 `숙제관리` 배지 1·목록 `검증재접속 · 11/23 · 25분 · 30문제 · 사진 2`, 상세에서 두 사진이 서명 URL 로 보입니다. 같은 화면에서 사진을 ✕로 빼면 초안·Storage 가 즉시 비고, `취소` 로 닫으면 `draft_open` 만 내려가 다음 접속에 저절로 열리지 않으며, 다시 열면 찍어 둔 사진이 그대로 있습니다. 검증용 학생·세션·제출·사진은 모두 지워 남은 데이터 0건입니다.
- 이어서 **60분 자동 종료 뒤 「지난 숙제 공부 제출」 창**도 확인했습니다: 초안 사진이 있던 숙제 세션을 61분 쉰 것으로 마무리하자 제출 줄에 사진 1장이 남았고, 학생이 코드를 넣고 들어오자 그 창이 **사진 1/5 그대로** 열려 `12` 문제로 제출 → 홈의 숙제 제출 목록이 **새로고침 없이** `1시간 1분 · 12문제` 로 바뀌었습니다(마저 내면 홈 목록을 그 자리에서 다시 읽도록 `refreshKey` 추가).
- 스크린샷: `downloads/sunogong-homework-resume-restored.png`(새로고침 뒤 사진 1/5 가 살아 있는 제출 창), `downloads/sunogong-homework-resume-admin-detail.png`(관리자 숙제관리 상세 — 사진 2장·25분·30문제).
- 참고: 이 환경의 Playwright 번들 브라우저는 시스템 라이브러리(`libnss3`)가 없어 실행되지 않아, 위 화면 확인은 원격 브라우저로 안드로이드 User-Agent 를 맞춰(학생 화면은 PC 접속을 막으므로) 진행했습니다. `tools/check-homework-ui.mjs` 는 라이브러리가 있는 환경에서 그대로 쓸 수 있습니다.

**숙제 승인 — 선생님 칭찬 한마디 (2026-11-23)** — 숙제관리에서 승인할 때 칭찬·응원 한마디를 함께 남기고 학생 홈에 민트 박스로 보여 줍니다.
- **관리자 숙제관리 상세**: 반려 사유 칸 위에 `선생님 칭찬 한마디 (선택 · 학생에게 보여요)` — 칩 다섯 개(`풀이가 꼼꼼해요 · 글씨가 깔끔해요 · 어려운 문제 잘 고민했어요 · 꾸준히 잘하고 있어요 · 스스로 잘 풀었어요`)를 누르면 입력칸에 들어가고 다시 누르면 빠집니다. 직접 쓴 글과 섞을 수 있고 200자까지입니다. 비워 두면 예전처럼 1탭 승인, 모두 반려면 칸이 잠깁니다. 승인 목록 줄과 처리 완료 상세에도 `👏 한마디` 가 보입니다.
- **학생 홈 숙제 제출**: 승인된 건에 한마디가 있으면 연두/민트색 박스 `👏 선생님 한마디: …` (`bg #E9FAF0` · 테두리 `#B9E8CE` · 글자 `#177A4A`). 한마디가 없으면 박스 없이 예전 그대로입니다.
- **DB**: `homework_submissions.teacher_comment`(check ≤ 200자), `review_homework_submission(p_submission_id, p_time_approved, p_problems_approved, p_reject_reason, p_teacher_comment default null)`. 하나라도 승인했을 때만 저장하고 모두 반려면 비웁니다. 200자를 넘기면 `comment_too_long` 으로 거절하며 아무것도 바뀌지 않습니다. 4개 인자로 부르던 예전 화면은 새 인자 기본값으로 그대로 동작합니다.
- **검증**: 단위 **485건**(+11 — 칩 문구·넣기/빼기·직접 글과 섞기·200자 넘김 방지·공백 정리·승인 건에만 보이기), 스모크 **161건·33개 화면**(`PraiseEditor` 2종·`HomeworkSubmissionRow` 2종 추가) 통과, `npm run build` 통과. 마이그레이션은 PostgreSQL 파서 검사와 **운영 DB(`qdzlenhmhszdsnygslhp`) 실행**을 통과했고 `schema.sql` 전체를 다시 실행해도 결과가 같습니다(학생 54·기록 30·제출 5건 그대로).
- `supabase/verify-2026-11-23-homework-teacher-comment.sql` (운영 DB에서 실행) — 승인 저장·앞뒤 공백 정리·201자 `comment_too_long`·모두 반려면 미저장·예전 4개 인자 호환·기록 반영·드래곤볼 그대로, 검증 데이터 0건.
- 실서비스 E2E `node tools/e2e-homework-praise.mjs` **19건** 통과: 승인+칭찬 저장 → 학생이 읽는 목록에 그대로 → 칩 여러 개 문구 → 예전 4개 인자 호출 → 모두 반려 미저장 → 200자 초과 거절 → 공백만 null → 두 번 처리 거절 → 기록(65분·17문제)·드래곤볼 0 그대로 → 사진 서명 주소. 검증용 학생·제출·사진 0건.
- 배포한 `https://sunogong.vercel.app`(새 번들 `index-2G40GALD.js`)를 360×780 으로 열어 `node tools/check-homework-ui.mjs` **69건** 통과 — 상세에 칭찬 칸·칩 5개·안내가 있고, 칩을 누르면 눌린 상태로 입력칸에 들어가며, 저장 뒤 `teacher_comment` 가 `풀이가 꼼꼼해요 다음에도 이렇게 해봐요!` 로 남고, 관리자 승인 목록·처리 완료 상세에도 보입니다. 학생 홈에서는 민트색(`rgb(233, 250, 240)`) `선생님 한마디:` 박스가 승인 건에만 **1개** 보이고, 한마디 없는 승인 건을 하나 더 만들어도 박스는 늘지 않습니다. 360px에서 잘리지 않았고 검증용 데이터는 0건입니다.
- 스크린샷: `downloads/sunogong-homework-praise-360.png`(학생 홈 민트 박스), `downloads/sunogong-homework-praise-editor-360.png`(관리자 칭찬 칩·입력), `downloads/sunogong-homework-praise-approved-detail-360.png`(처리 완료 상세의 한마디), `downloads/sunogong-homework-admin-approved-360.png`(승인 목록의 👏 줄).

**숙제 공부 — 사진 없이도 제출 (2026-11-23)** — 원장님 요청으로 사진 첨부를 필수에서 **선택**으로 바꿨습니다.

1. **화면** — `숙제 공부 제출`(타이머 종료) 창과 `지난 숙제 공부 제출`(자동 종료 뒤 다음 접속) 창 모두, 사진이 0장이어도 `제출` 이 그대로 눌립니다. 다만 사진 0장으로 누르면 바로 내지 않고 확인 창 `사진 없이 제출할까요?` 에 **`사진 없이 공부를 마치면 반려될 수 있습니다. 그래도 제출하시겠습니까?`** 를 띄웁니다 — `취소` 면 제출 창으로 돌아가고(사진을 더 고를 수 있음), `그래도 제출` 이면 사진 0장 그대로 승인 대기로 제출됩니다. 확인 창의 `✕`·바깥 누르기·Escape 도 `취소` 와 같습니다.
2. **판단은 순수 함수** — `src/lib/homeworkBoard.ts` 의 `needsNoPhotoConfirm(photos, confirmed)`(사진 0장이고 아직 확인 전이면 true)와 `homeworkSubmitProblem(problems, photos)`(이제 5장 초과만 막음)로 계산하고, 문구는 `HOMEWORK_NO_PHOTO_CONFIRM` 상수 하나를 두 창이 함께 씁니다. 사진이 필요한데 없다는 빨간/노란 경고(`photoWarn`)는 없앴습니다.
3. **DB** — `supabase/migrate-2026-11-23-homework-photo-optional.sql` 이 `submit_homework`·`submit_pending_homework` 에서 `photo_required` 예외를 없앱니다(5장 초과 `too_many_photos` 는 그대로). 표 제약은 원래 최소 장수를 보지 않아 손대지 않았고, 관리자 숙제관리 상세는 사진 0장일 때 이미 `올린 사진이 없어요. 사진 없이 낸 제출이에요.` 를 보여 줍니다.
4. **검증** — 단위 테스트 **487건** 통과(추가: 사진 0장이어도 막히지 않음 · 확인 문구 그대로 · `needsNoPhotoConfirm` 4가지 · 확인 뒤 제출), 스모크 **35개 화면/162건**(사진 고르기 안내가 `사진 없이도 제출할 수 있어요` 로 바뀌고 `1장 이상 올려주세요` 가 사라졌는지), `npm run build` 통과. 실서비스 360px 확인은 `node tools/check-homework-no-photo.mjs https://sunogong.vercel.app /workspace/downloads` — 배포본에서 **17건 통과**: 사진 0장으로 `제출` → 확인 창(문구·취소·그래도 제출·360px 안에서 잘리지 않음) → `취소` 면 제출 창으로 돌아오고 아직 저장 안 됨(초안 행만) → 다시 `제출` → `그래도 제출` → `사진 0장 · 30문제 · 25분` 승인 대기 저장 → 60분 자동 종료된 `지난 숙제 공부 제출` 창에서도 같은 확인 → `12문제 · 사진 0장` 저장. DB 규칙도 따로 확인했습니다 — 사진 0장 제출 성공, 6장은 여전히 `too_many_photos`, `submit_pending_homework` 도 0장 허용. 검증용 학생·세션·제출·사진은 지워 **남은 검증 데이터 0건**입니다.
   - 스크린샷: `downloads/sunogong-homework-no-photo-confirm-360.png`(사진 0장 확인 창), `downloads/sunogong-homework-no-photo-confirm-pending-360.png`(지난 숙제 확인 창).

**관리자 「수업 종료」 (2026-11-23)** — 진행 중(공부 중·일시정지)인 학생의 공부를 선생님이 실시간 탭에서 직접 마무리한다.

1. **화면** — 실시간 탭의 활성 세션 카드(🏫 학원·🏠 숙제 모두) 배지 줄 오른쪽에 `수업 종료` 버튼. 누르면 확인 창이 열린다.
   - 제목 `수업을 마칠까요?`, 요약 한 줄 `검증수업종료 · 🏫 학원 공부 · 공부 중 25:05`, 큰 글씨 `지금까지 25분`(쉬는 중이면 `잠깐 쉬는 중 — 쉬기 전까지의 시간이에요`), `오늘 푼 문제 수 (선택)` 입력칸(placeholder `0`, 비우면 0문제), 공부 종류에 따른 안내(학원 `지금까지 공부한 시간과 문제 수가 오늘 기록에 바로 들어가요` / 숙제 `선생님 확인(승인)을 거친 뒤 … 사진은 학생이 올려 둔 것이 있으면 그대로 남아요`), 1분 미만 경고, `취소`·`수업 종료` 버튼. 360px 에서 잘리지 않는다.
   - 확정하면 목록에서 바로 사라지고 `검증수업종료 · 🏫 학원 공부 25분 7문제로 수업을 마무리했어요.` / 숙제는 `… 승인 대기로 넘겼어요 — 숙제관리에서 확인해 주세요.` / 이미 끝난 세션이면 `… 이미 끝나 있었어요. 기록은 그대로 두었어요.` 가 보인다.
2. **DB** — `admin_end_study_session(p_session_id, p_problems default null)`
   - 이미 끝난 세션이면 **아무것도 건드리지 않고** 지금 상태만 `already_finished: true` 로 돌려준다(두 번 눌러도 기록이 두 번 쌓이지 않음).
   - 공부 중이면 `now()`, 일시정지 중이면 `paused_at` 까지를 공부 시간으로 본다(`finish_session` 과 같은 계산). 학원은 `finish_session` 에 그대로 넘겨 **5시간 상한·자정 넘김·하루 기록 upsert** 규칙을 공유한다. 자정을 넘긴 세션은 기록 없이 세션만 지운다.
   - 숙제는 `close_homework_session` 으로 **승인 대기 제출**을 만든다(사진은 초안에 있던 것이 그대로). 문제 수를 비우면 0문제. 1분도 안 됐고 문제 수도 0이면 `nothing` 으로 기록·제출을 남기지 않는다.
   - `study_sessions.ended_by_admin` 로 표시를 남기고 응답에도 `ended_by_admin` 이 붙는다. `study_session_state(p_session_id)` 는 학생 기기가 읽는 읽기 전용 확인(끝났으면 `finish_session` 과 같은 모양의 결과).
3. **학생 화면** — `useStudyTimer` 가 **10초마다**(그리고 화면을 다시 켜거나 창에 초점이 돌아올 때) `study_session_state` 를 읽는다.
   - `finished` 면 결과 화면으로 바뀌고 아래에 `선생님이 수업을 마무리해서 타이머를 멈췄어요` 가 보인다. 숙제는 `🙌 선생님이 마무리했어요 — 확인을 기다려요` 로 안내한다.
   - 세션이 사라졌으면(자정 넘김) 오류 대신 대기 화면으로, 아직 진행 중이면 아무 일도 하지 않는다. 학생이 같은 순간에 종료를 눌러도 둘 중 하나만 기록된다.
4. **검증** — 단위 **501건**(+14 — 문제 수 변환 0·9999 상한·글자 섞임·입력칸 4자리, 종류별 안내, 확인 요약, 마무리 안내, 이미 끝남 안내), 스모크 **176건·35개 화면**(`LiveSessionRow`·`EndStudyModal` 추가 — 버튼·접근성 이름·상태·시간·배지·문제 수 입력·취소/종료), `npm run build` 통과. 새 마이그레이션은 PostgreSQL 파서 검사와 **운영 DB(`qdzlenhmhszdsnygslhp`) 실행**을 통과했고 `schema.sql` 전체를 다시 실행해도 결과가 같다.
5. 실서비스 E2E `node tools/e2e-admin-end-study.mjs` **49건** 통과 — 공부 중 25분 세션 → 7문제로 종료 → 세션 `finished`·`ended_by_admin`·기록 `academy_minutes 25 · academy_problems 7`, 두 번 누르면 `already_finished` 로 기록 그대로, 일시정지(40분 시작·10분 전 멈춤) → **30분**으로 정산하고 `ended_at = paused_at`, 숙제 20분 → 승인 대기 제출(20분·0문제·사진 0장)이고 `study_logs` 는 그대로, 숙제 두 번 눌러도 제출 줄 하나, 숙제 30초·0문제 → `nothing`, 자정 넘긴 세션 → `discarded` 로 세션만 정리, 없는 세션 → `session_not_found`/`missing`, 드래곤볼 0개·지급 기록 없음, **실제 운영 중이던 학생 세션은 `ended_by_admin` 0건으로 그대로**. 검증용 학생·세션·기록·제출은 지워 남은 데이터 0건.
6. 배포한 `https://sunogong.vercel.app`(새 번들 `index-Dh9H91m4.js`)를 360×780 으로 열어 `node tools/check-admin-end-study.mjs` **29건** 통과 — 실시간 탭 카드의 `수업 종료` 버튼이 360px 안(x 214~275)에 있고, 확인 창(444px 높이·가로 잘림 없음)의 이름·`지금까지 25분`·문제 수 입력·안내·취소/종료가 모두 보이며, 7문제로 확정하자 목록에서 사라지고 `25분 7문제로 수업을 마무리했어요` 가 뜨고 DB 기록이 `25분·7문제` 로 들어갔다. 숙제 20분은 확인 창에 `🏠 숙제 공부`·승인 안내가 뜨고 확정 뒤 `승인 대기로 넘겼어요`·제출 `pending 20분·0문제`·기록에는 미반영. **학생 기기를 타이머에 그대로 둔 채** 서버에서 종료하자 **9초** 만에 결과 화면으로 바뀌며 `10분`·`3문제`·`선생님이 수업을 마무리해서 타이머를 멈췄어요` 가 보였고 오류 안내는 없었다. 검증용 데이터는 0건, 실제 학생의 `ended_by_admin` 도 0건.
7. 스크린샷: `downloads/sunogong-admin-end-study-360.png`(수업 종료 확인 창), `downloads/sunogong-admin-end-study-list-360.png`(카드의 버튼)

**문제 수 0~999 상한 · 학생이 오늘 학원 공부 문제 수 수정 (2026-11-23)** — 학생이 넣는 문제 수를 0~999 로 제한하고, 오늘 학원 공부 문제 수를 학생이 직접 고칠 수 있게 했습니다.
- **DB** — `supabase/migrate-2026-11-23-problems-limit-student-edit.sql` 을 운영 DB(`qdzlenhmhszdsnygslhp`)에 적용하고 `schema.sql` 에도 같은 정의를 넣었습니다. 적용 전후 실제 데이터는 그대로입니다(students 54 · study_logs 50 · study_sessions 79 · homework_submissions 10 · dragonball_grants 20, 분·문제 합계도 동일).
- **검증 SQL** `supabase/verify-2026-11-23-problems-limit.sql` (운영 DB에서 실행, 검증용 학생은 끝나고 삭제) 통과 — 학원만 바뀌고 숙제·시간 그대로 · 돌려주는 합계(`problems = 학원+숙제`) · 어제 기록 불변 · 0·999 통과 / 1000·-1·null `problems_out_of_range` · 오늘 학원 기록 없으면 `no_academy_today` · 오늘 기록 없으면 `log_not_found` · `finish_session`/`set_session_problems`/`submit_homework` 의 1000 거부와 세션·대기 표시 그대로 · 숙제 초안 5000→999 · 예전 인자 호출 호환.
- **단위** **509건** 통과(신규 8건 — 999까지 쌓기·999를 넘기는 자리 막기·상한 판정·안내 문구·오늘 학원 기록 판단·합계 재계산), **스모크 187건**(화면 39개 렌더 + 확인 9건: 결과 화면 수정 버튼·수정 창 제목/안내/지금 값·기록 없거나 숙제 승인 대기면 버튼 없음·관리자 입력칸 `max="999"`), `npm run build` 통과.
- **실서비스 E2E** `node tools/e2e-problems-limit-edit.mjs` **34건** 통과 — `finish_session` 1000 거부(세션 공부 중 그대로)·5 반영, `submit_homework` 1000 거부·3 승인 대기, 오늘 학원 문제 수만 20/0/999로 수정(숙제 문제 수·공부 시간 그대로), 1000·-1·null 거부 뒤 값 그대로, 어제 기록 불변, 숙제만 한 날 `no_academy_today`, 기록 없는 날 `log_not_found`, 관리자 「수업 종료」 1000→999, `set_session_problems` 1000 거부·7 반영, 예전 인자 호출, 실제 학생 기록·진행 중 세션 불변, 검증 데이터 0건.
- **360×780 화면** `node tools/check-problems-edit-ui.mjs` **25건** 통과 — 타이머 종료 창에서 999 뒤 한 자리 더 누르면 `문제 수는 999개까지 넣을 수 있어요.` 안내와 함께 999 그대로 → 12문제 저장 → 결과 화면 `문제 수 수정` → 20문제(합계도 20) → 홈에서 0문제 → 999 초과 입력 막힘·취소하면 DB 그대로, 가로 넘침 없음(`scrollWidth 360`), 검증 학생 정리. (이 환경의 Playwright 는 `LD_LIBRARY_PATH=/workspace/tmp/pw/sysroot/usr/lib/x86_64-linux-gnu` 로 실행합니다.)
- **회귀 확인** — `node tools/e2e-admin-end-study.mjs` **49건** 통과(이전에 「다른 학생의 선생님 종료 0건」으로 세던 검사를, 실제 운영에서 선생님이 끝낸 세션이 쌓인 뒤에도 맞도록 「새로 늘어난 것 없음」으로 고쳤습니다), `node tools/e2e-homework-draft.mjs` 통과. `e2e-homework-approval`(사진 필수)과 `e2e-pause-autoend`(숙제 자동 종료가 기록 줄을 만든다고 봄)는 2026-11-23 사진 선택·숙제 승인 변경 **전에 쓰인 기대값**이라 지금 동작과 맞지 않아 실패합니다(이번 작업과 무관, 손대지 않았습니다).
- 스크린샷: `downloads/sunogong-student-edit-problems-360.png`(홈에서 오늘 학원 문제 수를 고치는 창), `downloads/sunogong-problems-limit-999-360.png`(999에서 한 자리 더 누를 때 안내), `downloads/sunogong-student-edit-problems-home-360.png`(고친 뒤 홈 — `✏️ 문제 수 수정`·`푼 문제 0개`·안내 문구)., `downloads/sunogong-admin-end-study-done-360.png`(마무리 안내), `downloads/sunogong-admin-end-study-homework-360.png`(숙제 확인 창), `downloads/sunogong-admin-end-study-student-360.png`(학생 결과 화면).

---

## 10. 저장 용량 관리 (질문 사진·영상 · 숙제 사진)

Supabase 무료 플랜은 Storage **1GB** 까지 씁니다. 질문 사진은 올리기 전에 줄여서(장당 100~400KB) 올리고,
답변 영상은 1개 **50MB** 까지로 제한합니다(앱에서 미리 검사해 안내).

**숙제 사진(2026-11-23)** — 숙제 공부 사진은 **긴 변 1200px · JPEG 품질 0.72** 로 줄여 올려 장당 **100~150KB**, 한 번에 **최대 5장**입니다.
버킷(`homework-photos`)도 1개 **5MB**·사진 형식만 받습니다. 사진은 **고르는 즉시 1장씩** 올라가고 초안 줄(`homework_submissions.draft_active`)에 경로가 적히므로, 제출하지 않고 그만둔 초안은 `clear_homework_draft`/세션 삭제 트리거로 DB 줄과 파일을 함께 지웁니다(사진을 ✕로 빼도 그 파일을 바로 지움). 숙제 사진은 최종 확인(승인) 근거라 **자동으로 지우지 않고** 남겨 둡니다 —
용량이 차면 오래된 승인 건의 사진만 지우는 정리 기능을 이어서 붙일 수 있습니다(DB 줄은 그대로 두고 파일만 지운다).

질문함을 열 때 **답변 완료 후 7일이 지난 질문과 사진·영상 파일을 자동으로 지운다** (`QuestionsPanel`, 기본 켜짐 · 끄기 스위치 있음).
- DB 줄(`study_questions`)을 지우는 것과 함께 **Storage 파일도 직접 지워서** 용량이 실제로 비워진다.
- 답변을 달지 않은 질문은 지우지 않는다.
- `지금 정리` 버튼으로 바로 정리할 수도 있고, 화면에 `지금 정리할 질문 N개` 가 표시된다.
- 보관 기간을 바꾸려면 `src/lib/questionBoard.ts` 의 `QUESTION_RETENTION_DAYS` 값을 고친다(기본 7일).

DB에 쌓이는 질문 줄은 글자 몇백 바이트라 용량에 거의 영향이 없고, 큰 것은 사진·영상 파일이다.

---

## 11. 지난 날짜 미종료 세션 자동 정리 (2026-11-23)

원장님 요청(`알아서정리하게설정해줘 24시지나면`)으로, **한국 시간 자정이 지나면 지난 날짜에 시작한 미종료 공부 세션을 서버가 알아서 정리**한다. 피클 크레딧을 쓰지 않고 Supabase 안에서만 처리한다.

**정리 규칙** (기존 자정·일시정지 규칙 그대로, `finish_session` 을 거친다)

| 세션 | 처리 |
|---|---|
| 일시정지된 공부 (`paused_at` 있음) | 멈춘 시각까지를 **그 날 기록으로 정산** — 학원은 `study_logs.academy_*`, 숙제는 **승인 대기 제출** |
| 일시정지 없이 자정을 넘긴 공부 | 기록 없이 **세션만 폐기** (12시 전에 끝내지 않은 공부는 남기지 않는 기존 규칙) |
| 1분 미만 · 0문제 숙제 | 승인 대기 없이 세션만 마무리(`nothing`) |
| 오늘(00:00 이후) 시작한 세션 | **절대 건드리지 않는다** |
| 문제 수 | 세션·초안에 적혀 있으면 그대로, 모르면 0 (관리자 「수업 종료」와 같은 기준) |

**도는 방법 두 가지**

1. **예약 실행** — `pg_cron` 작업 `sunogong-stale-session-cleanup`, `5 15 * * *` (UTC 15:05 = **매일 00:05 KST**, pg_cron 시간대는 GMT). `select public.cleanup_stale_study_sessions()` 를 부른다. 실행 기록은 `cron.job_run_details`.
2. **안전장치** — `maybe_cleanup_stale_study_sessions()` 가 지난 세션이 **있을 때만** 정리한다. `start_session`(학생 공부 시작) · `active_session`(학생 재접속) · `live_study_board`(근두운 판) 맨 앞에서 부르므로, 예약이 한 번 실패해도 앱을 쓰는 순간 정리된다. 확인은 미종료 세션 부분 인덱스(`study_sessions_unfinished_started_idx`) 한 번이라 가볍다.

**앱에서 직접 부를 수는 없다** — `cleanup_stale_study_sessions`·`maybe_cleanup_stale_study_sessions` 는 anon/authenticated 권한을 회수해 서버(예약 작업·앱 진입 함수)만 쓴다.

**직접 확인·수동 실행** (Supabase SQL Editor)

```sql
-- 지난 날 미종료 세션 (0이어야 정상)
select id, student_id, date, kind, status, started_at, paused_at
  from public.study_sessions
 where ended_at is null
   and started_at < public.kst_today()::timestamp at time zone 'Asia/Seoul';

-- 미리보기(아무것도 바꾸지 않음)
select public.cleanup_stale_study_sessions(true);

-- 지금 바로 정리
select public.cleanup_stale_study_sessions();
```

**적용·검증 (2026-11-23, 운영 DB `qdzlenhmhszdsnygslhp`)**
- 운영 DB에 **`pg_cron` 1.6.4 설치 + 예약 작업 등록 완료**(`jobid 1`, `active = true`). 예약이 실제로 도는지 확인하려고 1분짜리 임시 작업(`sunogong-cleanup-selftest`)을 걸어 두고 기다린 결과 `cron.job_run_details` 에 **`succeeded` · `1 row`** 로 남았고, 확인 뒤 임시 작업은 지웠다.
- `supabase/verify-2026-11-23-stale-session-cleanup.sql` (운영 DB에서 실행) — **11건 모두 통과**: 미리보기가 3건을 찾고 아무것도 바꾸지 않음 · 일시정지 학원 25분이 그 날 기록으로 정산 · 일시정지 없이 자정 넘긴 공부는 세션 줄 삭제(기록 0) · 지난 숙제 30분은 승인 대기(30분·0문제) · 오늘 세션은 running 그대로 · 두 번째 정리 0건 · 지난 세션이 없으면 안전장치는 null · 검증 데이터 0건.
- `node tools/e2e-stale-session-cleanup.mjs` (앱과 같은 anon 키로 실서비스) — **12건 모두 통과**: `start_session` 이 지난 세션을 정리하고 오늘 새 세션을 연다 · `live_study_board` 가 자정 넘긴 공부를 폐기한다 · `active_session` 이 지난 숙제를 승인 대기로 넘긴다 · 오늘 세션은 그대로 · anon 은 정리 함수를 직접 부를 수 없다(`permission denied`).
- 처음 발견한 지난 세션 2건(둘 다 숙제·일시정지)은 `admin_end_study_session(id, 0)` 로 마무리했다 — **임소윤 7분 → 승인 대기 제출(0문제)**, **안수빈 0분·0문제 → 기록 없이 세션만 마무리**. 처리 뒤 지난 세션 0건, 오늘 진행 중이던 7건은 그대로였다.

---

## 12. 학원 공부 시작 버튼 제거 — 훈출 연동 (2026-11-26)

새 출결·학원관리 앱 **'훈출'**(`https://hoonmath-app.vercel.app`)이 학생이 **등원하면 선오공 DB(`qdzlenhmhszdsnygslhp`)의 `study_sessions(kind='academy')` 를 시작하고, 하원하면 `admin_end_study_session` 으로 `study_logs` 까지 정산**하도록 연결되면서, 선오공 학생 화면에서 `🏫 학원 공부 시작` 을 뺐다(원장님 요청 2026-11-26).

**바뀐 곳**
- `src/student/StudentHomeScreen.tsx` — 홈 아래 버튼이 `🏠 숙제 공부 시작` 하나가 됐다(높이 56px, 숙제 색 보라 `#6D3BD6` 그대로).
- `src/student/ResultScreen.tsx` — 학원 공부 결과 화면에서 `공부 더 하기` 를 숨기고 `홈으로` 만 남긴다(훈출이 끝낸 학원 세션을 학생이 선오공에서 다시 시작하지 않도록). 숙제 공부 결과 화면의 `공부 더 하기` 는 예전과 같다.
- `src/student/TimerScreen.tsx` — 진행 중인 세션이 없을 때 뜨는 빈 화면의 `공부 시작` 버튼이 (기본값 `academy` 로) 몰래 학원 세션을 여는 길이라 `🏠 숙제 공부 시작` 으로 바꿨다.
- 학원 공부 타이머·문제 수(0~999) 수정·지난번 푼 문제 수·근두운·통계는 그대로다. 훈출이 시작한 학원 세션은 선오공을 열면 예전처럼 타이머로 이어 보여 준다.

**그대로 둔 것** — 숙제 공부 시작, 드래곤볼·근두운·성구·교환권, 숙제 제출·`숙제관리`, 질문함, 랭킹, 학원/숙제 분리 통계, 마이그레이션, DB 함수(`start_session`·`finish_session`·`admin_end_study_session`·`study_sessions`·`study_logs` 등). 훈출이 부르는 함수도 손대지 않았다.

**검증** — 단위 **509건** 통과, 스모크 **191건** 통과(새 확인 4건: 홈에 `학원 공부 시작` 없음 · `숙제 공부 시작` 있음, 학원 결과 화면에 `공부 더 하기` 없음 · 숙제 결과 화면에는 있음), `npm run build` 통과.

**실서비스 확인** (배포본 `https://sunogong.vercel.app`, 새 번들 `index-BPIb71nf.js`, 360×780)
- `node tools/check-academy-start-removed.mjs https://sunogong.vercel.app` — **12건 통과**: 홈에 `학원 공부 시작` 없음 · `🏠 숙제 공부 시작` 있음(보라, 높이 56px, 360px 안) · 누르면 숙제 타이머 · 훈출이 시작한 것처럼 만든 학원 세션은 선오공 학원 타이머로 그대로 이어짐 · 종료 뒤 결과 화면에 `공부 더 하기` 없이 `홈으로` 만 · DB에 학원 25분·5문제 기록. 검증용 학생·세션·기록은 지워 0건.
- `node tools/check-problems-edit-ui.mjs` — **27건 통과**(기존 25건 + `홈: 학원 공부 시작 버튼 없음` · `숙제 공부 시작 → 숙제 타이머`), 가로 넘침 없음(`scrollWidth 360`).
- 스크린샷: `downloads/sunogong-home-homework-start-only-360.png`(홈 아래 `🏠 숙제 공부 시작` 하나), `downloads/sunogong-academy-result-no-again-360.png`(학원 결과 화면 — `홈으로` 만).
- 컴퓨터 브라우저로 열면 예전처럼 `스마트폰 또는 태블릿에서만 이용할 수 있어요` 안내가 뜨므로, 학생 화면 확인은 휴대폰 화면(360×780)으로 했다.

---

## 13. 학원 세션 「0분 자동 종료」 원천 차단 가드 (2026-11-27)

**증상** — 2026-11-27 15:41 신유안 학생이 `훈출` 키오스크로 등원(W-4)해 학원 공부 세션(`6dc31aa4…`)이 시작되자마자 같은 시각에 `status='finished'`, `minutes=0`, `auto_pause_count=1` 로 끝났다는 보고(훈수학 비서).

**원인 (운영 DB에서 재현 확인)** — 서비스워커 캐시가 아니라 `pause_session` + `finish_session` 조합이었습니다.

1. `훈출`은 등원할 때 `study_sessions(kind='academy', status='running', attendance_id=…)` 를 INSERT 하는데, `last_heartbeat_at` 은 INSERT 시각(= `started_at`) 그대로이고 **훈출은 하트비트를 보내지 않는다**(하트비트는 선오공 앱만 10초마다).
2. 30초만 지나면 선오공 앱은 그 세션을 "하트비트 끊김"으로 봅니다(`isHeartbeatStale`). 2026-11-26까지의 `useStudyTimer` 는 앱을 열 때 `settleLoaded` 에서 **학원 세션도** `pause_session(p_auto=true)` 로 멈췄습니다.
3. `pause_session` 은 끊김이 30초를 넘으면 `paused_at = last_heartbeat_at` 으로 저장합니다 → **멈춘 시각 = 시작 시각**(이때 `auto_pause_count` +1).
4. 그 뒤 학생이 종료를 누르거나(구버전 `pagehide` 의 `pauseSessionBeacon` 도 같은 경로) 60분 일시정지 자동 종료가 돌면, `finish_session` 은 `ended_at = paused_at` 을 쓰므로 **`started_at == ended_at`(같은 시각) · `minutes 0` · `problems 0`** 인 0분 기록이 남습니다.

같은 모양의 실데이터: `6cdb7a40…`(04:58:19 시작, 시작=종료, 0분, auto_pause 1), `eaf72fa1…`(06:36:37→06:37:29, 0분, auto_pause 1). 재현 테스트(트랜잭션 안에서 `pause_session(auto)`→`finish_session(0)` 후 롤백)도 같은 결과였다.

**가드 4가지** (`supabase/migrate-2026-11-27-academy-zero-end-guard.sql`)

| 가드 | 내용 |
|---|---|
| `pause_session` | 학원(`kind='academy'`)은 **자동 일시정지하지 않는다**(숙제만). 수동 일시정지도 `paused_at ≥ started_at + 1초` 로 보정 → 0초 일시정지가 생기지 않는다. |
| `finish_session(…, p_force default false)` | 학원 세션이 **실제 공부 60초 미만**이면 `academy_too_short`, **훈출이 연 세션(`attendance_id`)인데 아직 하원 전**이면 `academy_managed_by_kiosk` 로 거부. `p_force=true` 는 관리자 「수업 종료」 전용. |
| `auto_end_paused_session` | 실제 공부가 60초 미만이면 자동 종료하지 않고 `too_short` 로 돌려준다(세션은 그대로). |
| `study_sessions` UPDATE 트리거 | 학생 폰(anon/authenticated)이 표를 **직접** 고쳐 훈출 세션을 끝내지 못하게 한다(하트비트 컬럼만 허용, 60초 미만 `finished` 금지). 앱 RPC(security definer)는 통과. |

**프론트엔드**
- `src/student/useStudyTimer.ts` — 앱을 열 때 학원 세션은 더 이상 일시정지하지 않고 마지막 신호만 지금으로 맞춘다(숙제만 기존처럼 일시정지). 자동 종료 응답이 `too_short` 면 다시 시도하지 않는다.
- `src/student/TimerScreen.tsx` — 훈출이 연 학원 세션(`attendance_id`)은 종료 창을 열지 않고 `학원 공부는 훈출에서 하원하면 자동으로 마무리돼요` 안내를 띄운다.
- `src/lib/api.ts` — `academy_too_short` · `academy_managed_by_kiosk` · `session_managed_by_kiosk` 를 학생이 읽을 수 있는 문장으로 바꾼다.
- `src/lib/appUpdate.ts` + `src/main.tsx` — 화면이 다시 보일 때(10분에 한 번) 서버 `index.html` 이 가리키는 번들 이름을 확인해 다르면 새로고침 → 예전 탭이 옛 규칙으로 계속 도는 문제를 줄인다. `vercel.json` 에 `index.html`·`sw.js` `Cache-Control: no-cache, no-store` 를 넣었다. (`public/sw.js` 는 푸시 전용이라 fetch 를 가로채지 않는 것을 다시 확인)

**훈출 쪽 영향** — `attendance_apply`(등원/하원/전체퇴실)·`settle_academy_session`·`admin_end_study_session`·`start_session`·`pause_session`(훈출 서버는 service_role)은 그대로 동작한다. 달라진 것은 **학생 앱이 훈출 세션을 끝내려 할 때 거부**되는 것뿐이다. 훈출이 `finish_session` 을 직접 부르는 곳이 있다면 3번째 인자 없이(=가드 켜진 상태) 호출되므로 `admin_end_study_session` 으로 바꾸는 것이 안전하다.

**검증** — `supabase/verify-2026-11-27-academy-guard.sql` 13건 전부 통과(학원 자동 일시정지 무시 · 0분 종료/0분 자동 종료 거부 · 3분 종료 정상 · 훈출 세션 하원 전 거부·하원 뒤 정상 · 관리자 강제 종료 · 숙제 자동 일시정지·자동 종료 유지 · anon 직접 수정 차단 · anon 하트비트 허용 · 5시간 상한 종료 · 지난 날 세션 정리 종료), PostgREST(anon 키) 실호출로도 같은 결과.

가드는 **오늘(KST) 세션**에만 적용하고 5시간 상한(18,000초)으로 마무리되는 경우는 통과시킵니다 — 그래서 `reconcile_session`·`resume_session`·`cleanup_stale_study_sessions` 같은 기존 자동 마무리가 막히지 않습니다.

`npm run build` 통과(새 번들 `index-CX9Iv1bG.js`), 단위 **512건** · 스모크 **191건** 통과.

**실서비스 확인** (`https://sunogong.vercel.app`, 360×780, `node tools/check-academy-guard.mjs`)
- 하트비트가 5분 끊긴 학원 세션: 앱을 열어도 `status=running`, `paused_at=null`, `auto_pause_count=0` (예전에는 여기서 paused 가 됐다) — 스크린샷 `downloads/sunogong-academy-guard-running-360.png`
- 6분 공부한 학원 세션 종료: 그대로 `finished`·6분·3문제로 기록(정상 흐름 유지)
- 방금 시작한 학원 세션 종료: DB 가 거부하고 세션은 `running` 유지, 화면에 `방금 시작한 학원 공부예요. 1분이 지난 뒤에 마무리해 주세요.` 표시 — `downloads/sunogong-academy-guard-too-short-360.png`
- anon 키로 `study_sessions` 를 직접 UPDATE 해 끝내려는 요청: `academy_too_short`/`session_managed_by_kiosk` 로 거부
- 훈출이 연 세션(`attendance_id`): 타이머 아래 `하원하면 자동으로 마무리돼요`, 종료를 눌러도 확인 창 대신 `학원 공부는 훈출에서 하원하면 자동으로 마무리돼요` 안내 — `downloads/sunogong-academy-kiosk-hint-360.png`
- 검증용 학생·세션·기록은 모두 지워 0건

**피해 복구** — 신유안 학생 세션(`6dc31aa4…`)은 훈수학 측이 `running` 으로 되돌려 둔 상태였고, 0분 종료 때 남은 `minutes=0·problems=0` 만 `NULL` 로 되돌려 하원 때 문제 수를 묻게 했다(공부 시간은 하원할 때 정산).

---

## 14. 「지난번 푼 문제 수」 저장이 막히던 문제 수정 + 문구 「훈출」 (2026-11-27)

**증상** — 2026-11-27 저녁 원장님이 지빈이(이지빈, 코드 3733) 계정으로 로그인하니 「지난번 푼 문제 수」 창(`11월 27일 (금) · 🏫 학원 공부 · 1분 공부`)이 떴고, `0` 을 누르고 `저장` 을 눌러도 창이 닫히지 않았다. 빨간 줄에는 아직 `학원 공부는 출훈(등·하원)에서 하원하면 자동으로 마무리돼요.` 가 떠 있었다.

**원인** — 13번 가드의 `study_session_guard()` 가 "학생 폰이 표를 직접 고쳤는지" 를 `current_setting('role')` 로 판단한 것이 틀렸다. PostgREST 는 앱(anon 키)이 부르는 **RPC 도 `SET LOCAL ROLE anon`** 으로 실행하므로, security definer 함수가 표를 고칠 때도 `role='anon'` 이 보여 정상 경로까지 `session_managed_by_kiosk` 로 막혔다. 그래서 모달의 `저장`(`set_session_problems`)이 거부되고 창이 그대로 남았다.

- 실DB 확인: 지빈이 11/27 세션 `f84fb01e-18fe-44f9-b6a3-afd1c74857e8`(15:31~15:32, 1분, `problems=null`, `problems_pending=true`, `attendance_id=ccd9f213…`)가 그 창의 대상이었다.
- 재현: `attendance_id` 가 있는 세션에 `set_session_problems(0)` → `session_managed_by_kiosk`, `attendance_id` 가 없는 세션은 같은 호출이 정상 통과.
- 같은 원인으로 **앱 RPC 가 훈출 세션에 쓰는 다른 길도 함께 막혀 있었다** — 수동 일시정지·재개(`pause_session`·`resume_session`), 관리자 「수업 종료」(`admin_end_study_session`).

**수정** — `supabase/migrate-2026-11-27-pending-problems-save-fix.sql`

- `study_session_guard()` 를 **security invoker** 로 바꾸고 `current_user` 로 판단한다.
  - 학생 폰이 표를 직접 고칠 때 → `current_user = anon/authenticated` → 가드 적용(그대로)
  - 앱 RPC(security definer) 안에서 → `current_user = postgres`(함수 주인) → 통과
  - 훈출 서버(service_role) → 통과
- 가드 내용(훈출 세션이면 하트비트만 · 60초 미만 종료 금지)과 `finish_session` 의 `academy_managed_by_kiosk` 거부는 그대로다.
- 문구 통일: UI·오류 문구·주석의 `출훈` 을 모두 **`훈출`** 로 바꿨다(`src/lib/api.ts`, `src/student/TimerScreen.tsx` 등 28곳 + README).

**검증**
- `supabase/verify-2026-11-27-pending-problems.sql` — 운영 DB에서 **9건 전부 통과**: 트리거가 invoker 인지 · 훈출 세션 0문제 저장(앱 경로) · 5문제 저장과 기록 합산 · anon 직접 수정 차단 · anon 0분 종료 차단 · anon 하트비트 허용 · 앱 RPC 일시정지·재개 · 하원 전 종료 거부(함수 가드) · 관리자 수업 종료.
- PostgREST(anon 키) 실호출: 대기 목록 1건 → `set_session_problems(0)` 성공 → 세션 `problems=0·problems_pending=false` → 대기 목록 0건, 표 직접 UPDATE 는 여전히 `session_managed_by_kiosk` 로 거부. 검증용 학생·세션·기록은 모두 지웠다.
- 단위 **512건** · 스모크 **189건** 통과(추가 4건: `훈출(등·하원)` 안내 2건·옛 표기 없음·문제 수 안내), `node tools/check-wording.mjs` 로 `src`·빌드 번들에 `출훈` 이 없고 `훈출` 안내가 있는지 확인, `npm run build` 통과.
