# 인프라 설정 & 결정 로그

> Claude Code와 프로젝트 채팅이 공유하는 **공통 기억** 파일.
> 외부 서비스 설정 결과와 의사결정을 여기에 기록한다.
>
> ⚠️ **실제 키 값·비밀번호·DB URL은 절대 이 파일에 쓰지 않는다.** (`.env.local`에만)
> 여기엔 "발급 완료 여부", "설정한 값의 이름", "확인한 정책 내용"만 적는다.

---

## 1. 외부 서비스 체크리스트

### Neon (PostgreSQL)
- [x] 프로젝트 생성 — 프로젝트명: `recheck`
- [x] 리전 선택: `AWS Asia Pacific 1 (Singapore)` — Neon에 도쿄 리전 없음, 한국에서 가장 가까운 AWS 리전
- [x] Postgres 버전: `18` (기본값)
- [x] 기본 브랜치명: `production` (`main` 아님 — 문서·설정에 브랜치명 적을 때 주의)
- [x] 오토스케일: `.25 ↔ 2 CU` (기본값 유지)
- [x] SQL Editor에서 `SELECT 1;` 정상 응답 확인
- [x] 연결 문자열을 `.env.local`의 `DATABASE_URL`에 저장 — **앱 경유 연결 검증 완료** (2026-08-11)
- [x] 마이그레이션 적용 확인 — 테이블 5개 생성됨: `ai_logs`, `properties`, `questions`, `users`, `visit_checks`
- [x] 인덱스 4개 생성 확인: `properties_user_idx` / `properties_status_idx` / `questions_prop_idx` / `visit_checks_prop_idx`
  - (이 문서에 2개로 적혀 있었으나 스키마상 properties 인덱스 2개가 추가로 있음)
- [x] 실 서버 버전 확인: PostgreSQL 18.4 / `drizzle.__drizzle_migrations` 1건 적용
- **무료 한도 (확인일 2026-08-11, 콘솔 대시보드)**
  - Compute 100 CU-hrs/월 · Storage 0.5 GB · Network transfer 5 GB · Branch 10개
  - 최소 0.25 CU 기준 약 400시간 → 4일 데모 규모에선 여유
- 메모: **scale-to-zero 있음.** 일정 시간 무요청 시 컴퓨트 정지 → 재기동 콜드 스타트.
  발표 직전 앱 1회 접속으로 웜업 필요.

### 카카오 개발자
- [ ] 애플리케이션 생성 — 앱 이름: `________`
- [ ] **JavaScript 키** 발급 → `.env.local`의 `NEXT_PUBLIC_KAKAO_MAP_KEY`
- [ ] **REST API 키** 발급 → `.env.local`의 `KAKAO_REST_KEY` (서버 전용)
- [ ] 플랫폼 > Web 도메인 등록
  - [ ] `http://localhost:3000`
  - [ ] Vercel 배포 도메인 `________`
- [ ] 지도 SDK 활성화 확인
- [ ] 우편번호(주소 검색) 서비스 사용 방법 확인
- [ ] **무료 사용 한도·상업적 이용 조건 공식 문서에서 확인** ← PRD "착수 전 확인 필요" 항목
  - 확인한 내용:
  - 확인 날짜:
- 메모:

### Gemini API
- [ ] API 키 발급 → `.env.local`의 `GEMINI_API_KEY` (서버 전용, `NEXT_PUBLIC_` 금지)
- [ ] 사용할 모델명: `________`
- [ ] **무료 티어 한도 확인** (분당/일일 요청 수)
  - 확인한 내용:
  - 확인 날짜:
- [ ] 한도 초과 시 폴백 동작 확인 (템플릿 질문으로 대체되는지)
- 메모:

### GitHub / Vercel
- [x] 저장소 생성 — `kwoo618/recheck_home` · **visibility: private** (2026-08-11 public → private 전환)
- [x] git 기본 브랜치 `main`으로 통일 — 원격 기본 브랜치 변경 + 원격 `master` 삭제 완료 (2026-08-11)
- [x] 첫 커밋 완료 — `32e5700` Day 1 (49파일) 푸시됨. 이후 `d11c483` docs 커밋
- [x] `.gitignore`에 `.env.local` 포함 확인 — 전체 히스토리 감사(`git log --all`) 결과 추적되는 env 파일은 `.env.example`뿐. 키 유출 없음
  - private 전환 이유: 봇이 public 저장소를 상시 스캔하므로 키가 한 번 커밋되면 푸시 직후 수 분 내에 수집됨. amend로 지워도 늦다. D2에 `GEMINI_API_KEY`·`DATABASE_URL`을 다루므로 선제 전환
- [ ] Vercel 프로젝트 연결
- [ ] **Vercel 함수 리전을 `sin1`(싱가포르)로 설정** ← Neon과 같은 리전. 기본값 `iad1`이면 DB 왕복이 태평양을 넘음
- [ ] Vercel 환경변수 등록 (4개: DATABASE_URL / GEMINI_API_KEY / NEXT_PUBLIC_KAKAO_MAP_KEY / KAKAO_REST_KEY)
- [ ] 첫 배포 성공 — 배포 URL: `________`
- [ ] 배포 도메인을 카카오 플랫폼에 등록했는지 재확인 ← 자주 빠뜨림
- 메모:

---

## 2. 의사결정 로그

> 두 채팅 사이에서 결정이 유실되지 않게, 정한 것을 여기에 남긴다.
> 형식: `[날짜] 결정 내용 — 이유`

| 날짜 | 결정 | 이유 |
|---|---|---|
| 2026-08-11 | Neon 리전 = AWS ap-southeast-1 (Singapore) | Neon에 도쿄 리전 없음. 한국에서 가장 가까운 AWS 리전. 리전은 생성 후 변경 불가 |
| 2026-08-11 | Vercel 함수 리전도 `sin1`로 맞춤 | Server Action 1회당 DB를 여러 번 왕복. 함수를 DB 옆에 두면 왕복이 리전 내부에서 끝나고, 사용자↔싱가포르 구간은 요청당 1회만 발생 |
| 2026-08-11 | Neon 오토스케일 기본값(.25~2 CU) 유지 | 무료 한도 100 CU-hrs 대비 여유. 데모 규모에서 조정 불필요 |
| 2026-08-11 | Neon Preview Workflow(브랜치 자동 생성) 미사용 | 4일 일정에 브랜치 관리 복잡도 추가할 이유 없음 |
| 2026-08-11 | Next.js **16.3.0** + React 19.2 + Tailwind **v4** | create-next-app 최신 기본값. shadcn/ui가 v4를 지원해 스택 변경 없음 |
| 2026-08-11 | 세션 쿠키 발급을 `proxy.ts`에서 수행 | 서버 컴포넌트는 렌더 중 쿠키를 쓸 수 없음. Next 16에서 `middleware.ts`는 deprecated → `proxy.ts`가 정식 이름 |
| 2026-08-11 | Server Action 쓰기는 예외 대신 `ActionResult{ok,error}` 반환 | 비전공 프론트가 try/catch 없이 `ok` 분기만으로 처리하게 하기 위함 (R4 정신) |
| 2026-08-11 | 조사지 재생성 시 사용자 기록은 보존 | 결과·메모가 입력됐거나 직접 추가한(`custom`) 항목은 규칙에서 빠져도 삭제하지 않음 — "기록은 사용자의 것" |
| 2026-08-11 | 마이그레이션은 pooled 문자열로 정상 동작 | 트러블슈팅 표의 "unpooled 필요" 대비책은 발동하지 않았음. `.env.example` 변경 불필요 |
| 2026-08-11 | 저장소를 private으로 전환 | 봇이 public 저장소를 상시 스캔. 키는 커밋되는 즉시 수집되고 amend로 지워도 늦다. D2에 Gemini 키·DB URL을 다룸 |
| 2026-08-11 | **전월세전환율 기본값을 코드에 넣지 않는다** — `cvRate`는 사용자 입력 전용 | 법정 전환율은 기준금리 연동이라 시점에 따라 변함. 화면에 미리 뜬 숫자를 사용자는 "서비스가 알려준 기준"으로 받아들이므로, 기본값 제공 자체가 판정에 해당 (R1·R8) |

---

## 3. 미해결 / 확인 필요

| 항목 | 상태 | 담당 |
|---|---|---|
| 카카오 무료 한도·상업적 이용 조건 | 확인 중 (강우가 콘솔에서 직접 확인, 값 전달 예정) — `lib/geocode.ts:14` 주석 그대로 유지 | 강우 |
| Gemini 무료 티어 한도 | 미확인 | 강우 |
| ~~`.env.local` 경유 실제 DB 연결~~ | ✅ 2026-08-11 검증 완료 (`drizzle-kit migrate` + 앱 코드 왕복) | 강우 |
| ~~전월세전환율(`cvRate`) 기본값~~ | ✅ 2026-08-11 결정 — **넣지 않음**, 사용자 입력 전용. 결정 로그 참조 | 강우 |
| 좌표 획득 방식 — 카카오 우편번호 위젯이 좌표까지 주는지, 별도 geocode 호출이 필요한지 | 미확인 (현재 코드는 둘 다 지원) | 강우 |

---

## 4. 트러블슈팅 기록

> 같은 문제로 두 번 막히지 않도록 기록.

| 증상 | 원인 | 해결 |
|---|---|---|
| (대비) `drizzle-kit push`가 DDL에서 실패 | pooled 연결에서 일부 DDL 제약 | Connect 모달에서 pooling 끈 unpooled 문자열로 마이그레이션만 실행. `.env.example`에 `DATABASE_URL_UNPOOLED` 추가 시 계약 변경이므로 결정 로그에 기록 |
| (대비) 발표 첫 화면이 수 초 멈춤 | Neon 무료 플랜 scale-to-zero 콜드 스타트 | 발표 직전 앱 1회 접속으로 웜업. 리허설 때 정지 후 첫 응답 시간 측정 |

---

## 5. D4 오전 리허설 체크리스트

> 발표 직전에 순서대로 확인한다.

- [ ] Neon 웜업 — 배포 URL에 1회 접속해 scale-to-zero 콜드 스타트를 미리 털어낸다
- [ ] 데모용 매물 2건이 등록돼 있고 지도에 핀이 찍히는지
- [ ] 조사지 인쇄(Print to PDF) 레이아웃 확인
- [ ] AI 라우트 폴백 확인 — Gemini 키를 일부러 비워도 템플릿 질문이 나오는지
- [ ] **저장소 public 전환** (발표에서 코드를 공개할 경우에만)
  - `gh repo edit --visibility public --accept-visibility-change-consequences`
  - ⚠ 전환 **전에** 반드시: `git log --all --pretty=format: --name-only | sort -u | grep -i env`
    → `.env.example` 외에 아무것도 나오지 않아야 한다
  - ⚠ Vercel 환경변수는 저장소가 아니라 Vercel 대시보드에 있으므로 공개 대상이 아니다
  - 발표 후 다시 private으로 돌릴지 미리 정해둘 것

---

## 6. 팀 진행 상황

| 담당 | 화면 | 상태 | 전달 여부 |
|---|---|---|---|
| 프론트 A | 홈 / 매물 등록 / 정보 확인 | | |
| 프론트 B | 조사지 / 조사지 인쇄 / 방문 기록 | | |
| 프론트 C | 비교 / 안전 점검 / 계약 후 | | |
| 강우 | 백엔드 전체 | **D1 완료** — Next.js/shadcn 세팅, 마이그레이션 적용, 세션, 매물 Server Actions, 유닛 테스트 47건 | — |
