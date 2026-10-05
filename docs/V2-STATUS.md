# V2-STATUS.md — Sealook Homes(씰룩홈즈) 진행 스냅샷

> **이 문서의 용도**: 새 채팅·새 세션이 "지금 어디까지 됐나"를 여기서만 읽는다.
> **움직이는 사실(일정·진행·미확인·준비물·열린 결정)은 이 문서에만 둔다.** 고정된 사실(범위·제약·실측값)은 `V2-PLAN.md` · `V2-TECH-REVIEW.md`에만.
> 단계가 끝날 때마다 갱신한다. v1 완료 시점 스냅샷은 `docs/v1/PROJECT-STATUS.md`(기록).
> 값에는 확인 상태를 붙인다: `[러너 실측+경로]` `[코드 경로+커밋]` `[설계 의도—미구현]` `[추정]`
> 마지막 갱신: 2026-10-05

---

## 1. 한 줄

목표는 **대구대 실배포 + 포트폴리오 완성도.** 공모전 출품은 포기했다(2026-09-29). 마감이 없으므로 일정은 날짜가 아니라 **단계 순서**다.
v2 필수 기능 코드는 `feat/v2`에서 만들어 **main에 머지·운영 배포했다(10/5, PR #1)**. 마이그레이션 `0002`는 운영·dev DB 모두 적용됐다(9/30). 가상 등기부 PDF로 업로드→대조→조사지→안전 점검→오프라인 큐 E2E 10단계가 dev·prod 빌드 둘 다 통과했고(`npm run e2e:v2`, 9/30), 0단계 하네스(CI verify · v1 베이스라인)도 갖췄다. 결정 2건(평 환산 B안 · 선납 24개월 경고)은 10/5 반영했다(§6).
**실제 등기부 실측(§4)은 머지를 막지 않는다**(강우 확인 10/5). 가상 PDF로만 통과한 상태이고, 머지 뒤에도 열린 항목으로 남는다(§4 · §7).

다음 순서:
1. ~~main에서 `feat/design`을 따고 `screenshots/v2-baseline/`을 찍는다~~ — 완료(10/5, §2)
2. `feat/design`에서 디자인(7단계)

머지 전에 하지 못한 것: 실기기 확인(PWA 설치·오프라인)과 프리뷰 DB 확인 — 둘 다 §7에 열린 항목으로 남는다.

---

## 2. 레포 실측 (2026-10-05)

| 항목 | 상태 | 확인 |
|---|---|---|
| `main` 마지막 커밋 | PR #1(`feat/v2`) 머지 커밋(10/5, `--merge` — squash 아님). 머지 커밋 해시는 이 문서 커밋 뒤에 생기므로 여기 적지 않는다 — `git log origin/main -1`로 확인. 머지 직전 `feat/v2`(`b0398c6`)는 `origin/main`(`0e0c5bb`)보다 33커밋 앞, 뒤처진 커밋 0. 이 문서 커밋은 세지 않은 값 | [러너 실측 — `git rev-list --left-right --count origin/main...feat/v2` 10/5] |
| 원격 브랜치 | `main` · `feat/screens`(v1) · `feat/v2`(머지 뒤에도 지우지 않는다). 머지 직전 로컬 `feat/v2`의 미푸시 커밋 0(`b0398c6` = `origin/feat/v2`). `feat/v2-api` · `feat/v2-screens` 없음. `feat/design`은 머지 뒤 만든다 | [러너 실측 — `git fetch` 후 `git branch -r` · `git rev-list --count origin/feat/v2..feat/v2` 10/5] |
| 로컬 브랜치 | `main`(= `origin/main`, 워크트리 `D:\projects
echeck`) · `feat/v2`(워크트리 `D:\projects
echeck-v2`). `feat/v2-api` · `feat/v2-screens`는 지웠다 | [코드 경로 — `git worktree list` 9/30] |
| `lib/ai/touchpoints.ts` | 있음 (야간 S2). ①②③④ active · ⑤ planned (④는 야간 S3). ①~④ 라우트가 이 id로 `ai_logs.touchpoint` 기록 | [코드 경로 — 야간 S3 커밋] |
| `lib/client/` | 있음 (야간 S3). `vault.ts`(IndexedDB 원본) · `pdf-text.ts`(pdfjs-dist 동적 import) · `document-api.ts`(④ 호출·마스킹·본문 크기 확인) | [코드 경로 — 야간 S3 커밋] |
| `lib/compare/` | 있음 (야간 S4). `normalize`(금액·한글 금액·면적·층·날짜·성명) · `pairs`(대조 쌍 = 결과 순서) · `compare`(status 산출) · `text`(결과 문장) · `question`(A′ 템플릿). 평↔㎡는 한쪽이 평·다른 쪽이 ㎡일 때만 `PYEONG_IN_SQM`(400/121)로 환산해 평 표기 자릿수로 반올림 비교 — 맞으면 `same`, 아니면 `needs_review`, `different` 없음(§6 B안). `tests/compare.test.ts` 152건 | [코드 경로+커밋 e3249ad — `lib/compare/normalize.ts:187` · `compare.ts:70`] · 건수 [러너 실측 — `npx vitest run tests/compare.test.ts` 10/5] |
| pdf.js 자산 | `pdfjs-dist` 6.3.289. worker `public/pdfjs/pdf.worker.min.mjs` **1,265,413 B** 자체 호스팅 + 라이브러리(`pdf.min.mjs` 기준) **458,705 B** = 약 **1.72 MB** (예산 2.0MB 안). Korean CMap(176,242 B)은 미포함 — 실측 후 결정. `next build`(9/30) 결과 pdf.js가 든 청크 455,720 B 1개 (내용 검색으로 찾음) | [러너 실측 — 파일 크기 · `next build` 9/30] |
| `docs/API-V2.md` | 있음 (야간 S2 최초 작성). 이후 변경은 승인 | [코드 경로 — 야간 S2 커밋] |
| 마이그레이션 `drizzle/0002_steep_warlock.sql` | **운영 DB에 적용됨** — 9/30 14:42 `db:migrate` 후 information_schema로 `documents` · `document_fields` · `discrepancies` 존재 조회. dev 브랜치는 10/5에 다시 만들었다(강우 확인 10/5). 새 dev의 적용 근거는 10/5 `e2e:v2` 통과 — `documents` · `document_fields` · `discrepancies` 저장·조회·삭제 동작. 그 e2e가 dev DB에 붙어 돌았다는 것은 "로컬 `.env.local`은 dev를 가리킨다(강우 확인 10/5)"에 기댄다. information_schema 직접 조회는 아니다. 내용: CREATE TABLE 3 · ADD COLUMN(nullable) 2 · FK 3 · INDEX 3. DROP · ALTER TYPE · 기존 컬럼 NOT NULL 없음 | 운영: [러너 실측 — 강우 9/30 14:42 조회] · dev: [러너 실측 — e2e:v2 10/5, ffa4eec·dc40da5] |
| `public/tessdata/` | 없음 — Tesseract 보류로 **만들지 않는다** | [코드 경로+커밋 f2d3ed1] |
| `public/manifest.json` · `sw.js` | 있음 (야간 S6). SW 직접 작성 — 캐시는 `/offline` 셸·그 청크·manifest·아이콘만. API·RSC·매물 HTML·원본은 캐시 안 함. 아이콘은 로고 원본(`brand/`, 배포 안 됨)에서 `npm run icon:gen`으로 만든다 — `app/icon.png` 512 · `public/icon-192.png` · `public/icon-maskable-512.png` · `app/apple-icon.png` 180. 머리글 로고는 정적 import라 `/offline` 셸 HTML에 경로가 실려(`preload`) 정적 캐시에 함께 담긴다. `VERSION` v2 (10/5 디자인 1차) | [코드 경로 — 야간 S6 커밋 · 디자인 1차 커밋 2] · 오프라인 머리글 로고 표시 [러너 실측 — next start 3001, 오프라인 `/offline` 로고 naturalWidth 320, 10/5] · 설치·오프라인 동작은 실기기 미확인 |
| `.claude/settings.json` | 9/9부터 로컬에만 있었고 `.gitignore`의 `.claude/`로 **미추적**이었다 → 2026-09-29 추적 전환 | [코드 경로+커밋 — 이번 커밋] |
| `.claude/settings.local.json` | 없음 (개인 설정 없음). 생기면 무시 대상 | [코드 경로+커밋 — 이번 커밋] |
| CI (`.github/workflows`) | `verify.yml` — push와 main 대상 PR마다 `npm ci` → `npm run verify` (Node 22, 비밀키 없음). `e2e:v2` · `qa:shoot`는 DB·AI·지도 키가 필요해 넣지 않는다. GitHub에서 실제 실행은 푸시 후 확인 | [코드 경로 — 클린 클론 verify 9/30] |
| `screenshots/v2-baseline/` | **회귀 비교 기준.** `feat/design`(= main `beceed7`, PR #1 머지 커밋)에서 촬영. v1과 같은 절차 — prod 빌드(`next build` → `next start -p 3000`) · `npm run shots` · dev DB의 기존 QA 시드 5건(이번에 `qa:seed`는 돌리지 않음 — 시드 존재는 강우 확인 10/5에 기댐) · 카카오 키 있음(지도 타일 찍힘). 화면 13종 × 3뷰포트 + 인쇄 2종(pdf·png) + `console-errors.md` = 44개. 실패 0 · 가로 넘침 0 · 콘솔 3건(`11-not-found` 404 리소스 × 3뷰포트). **콘솔 수집은 prod 빌드 기준이라 React 개발 경고(비교 화면 key 경고 등)는 잡히지 않는다** — "경고 없음"이 아니다 | [러너 실측 — `npm run shots` at `beceed7` 10/5] |
| `screenshots/v1-baseline/` | **기록.** 비교 기준은 v2-baseline으로 넘어갔다. 지우거나 갱신하지 않는다 (main `0e0c5bb`, 이름 교체 전 · 카카오 키 없이 촬영). 화면 13종 × 3뷰포트 + 인쇄 2종 + `console-errors.md` | [코드 경로+커밋 0e0c5bb] |
| `npm run verify` 정의 | `next typegen && tsc --noEmit` → `eslint` → `vitest run`. CLAUDE.md와 일치. 10/5 기준 lint 경고 0 · 테스트 12파일 530건 통과 | [러너 실측 — `npm run verify` at `dc40da5`] |
| 서비스명 | **Sealook Homes(씰룩홈즈)** 로 교체(1단계, 표시명만). 남은 옛 이름: `.claude/settings.json` `$comment`(쓰기 권한 없음) · `docs/PORTFOLIO-NOTES.md:1`(deny 대상) · INFRA 결정 로그(과거 기록) | [코드 경로 — 1단계 커밋] |
| `docs/PRD-V2.md` | 없음. 참조를 전부 지웠다. 사양은 `V2-PLAN.md` §4가 담당. 필요해지면 그때 만든다 | [코드 경로+커밋 — 이번 커밋] |

### 끊긴 경로 참조 — 1단계(이름 교체)에서 고쳤다

v1 문서를 `docs/v1/`로 옮기면서 아래 **코드 주석**이 옛 경로를 가리켰다. 1단계에서 전부 `docs/v1/` 경로로 고쳤다(`recheck-theme.css:3·362`, `tests/e2e/README.md:69·165` 포함).

| 파일 | 가리키는 옛 경로 |
|---|---|
| `app/admin/page.tsx:9` | `docs/PROJECT-STATUS.md` |
| `app/opengraph-image.tsx:17` | `docs/ARCHITECTURE.md` |
| `components/map/status-pin.ts:26` | `docs/recheck-prototype-v4.html` |
| `components/screens/_parts/home-landing.tsx:18` | `docs/LANDING-REDESIGN.md` |
| `tests/e2e/seed.mts:163` | `docs/HANDOFF-BACK.md` |
| `tests/glossary.test.ts:86` | `docs/HANDOFF-FRONT.md` |

문서 쪽도 두 곳이 옛 경로를 가리키지만 **그대로 둔다**: `docs/qa/README-팀원용.md:135`(`docs/SCREENS.md` — qa는 손대지 않음) · `docs/PORTFOLIO-NOTES.md:6`(`docs/HANDOFF-*.md` — settings.json deny 대상).

---

## 3. 단계 (순서만 정한다 — 마감 없음)

| 단계 | 내용 | 통과 기준 | 상태 |
|---|---|---|---|
| **0 하네스** | `.claude/settings.json` 추적(완료) · CI(verify) · `screenshots/v1-baseline/` 촬영 · 로컬 브랜치 재생성 | CI 초록 · 베이스라인 파일 존재 | **완료** — 베이스라인 `0e0c5bb` · CI `68e8287` · CI 첫 실행 초록(`e9f8a72`, 37초) |
| 1 이름 교체 | 옛 이름 → Sealook Homes(씰룩홈즈). 화면·메타·PDF 파일명(`SealookHomes_`) · 끊긴 주석 경로(§2). README는 저장소에 없음 | verify 통과 · shots 비교 | 부분 — verify 통과, shots·OG 렌더 미확인(야간 S1) |
| 2 스키마·계약 | 스키마·마이그레이션(승인) · `touchpoints.ts` · `docs/API-V2.md` | verify 통과 · 마이그레이션 승인 기록 | 부분 — verify 통과. `0002` 운영·dev DB 적용(§2). E2E에서 `documents`·`document_fields`·`discrepancies` 저장·조회·CASCADE 삭제와 새 컬럼 포함 시드가 동작 [러너 실측 — e2e:v2]. V1.5 Must 3건(면책 상수화 · 연도 주입 · 전월세전환 명칭)도 함께 처리(야간 S2). 승인 기록: `docs/INFRA.md` 결정 로그 2026-09-30 행 |
| 3 PDF 추출·구조화 | pdf.js 텍스트 레이어 추출 · 지점 ④ 구조화 + 마스킹 · 확인 화면 | 등기부 PDF 1건 필드 채워짐 (§4 실측표 선행) | 부분 — 가상 PDF로 E2E 통과, 실제 등기부 미검증 [러너 실측 — e2e:v2]. 가상 등기부(Chromium `page.pdf()`)에서 텍스트 추출 → ④ → 확인 화면에 소유자·주소 한글로 채워짐 → `saveDocument`. 코드·단위 테스트는 야간 S3. §4 실측표는 실제 등기부가 없어 빈칸 — 머지를 막지 않는다(강우 확인 10/5). 문서 화면 진입점: 매물 머리글 단계 이동에 "문서" 추가(`ffa4eec`, 전에는 안전 점검 안에만 있었다) [코드 경로+커밋 ffa4eec] |
| 4 대조 | `lib/compare` + 테스트 · 대조 결과 화면 · A′ 질문 연결 | **2종 대조에서 불일치 ≥1 검출·표시** | 통과 기준 충족(가상 문서) [러너 실측 — e2e:v2]. 등기부(④) ↔ 계약서(직접 입력)에서 `소유자 ↔ 임대인 · 다르게 기재` 검출·표시, 결과 화면 금칙어 0건, 조사지 "문서에서 확인된 차이" 질문 1개. `lib/compare` + 테스트 148건(야간 S4). 실제 불일치 사례(§5)로는 미확인. 읽을 수 없는 표기(단위 없는 금액·평·가린 성명 등)를 `needs_review`로 보내는 결정은 승인 대기(§6) |
| 5 계약서 12항목 | V2-PLAN §4-6 규칙 · 안전 점검 화면 | 12항목 표시 · 문구 검수 완료 | 부분 — 12항목 표시 확인: 계약서 `agent_flag=true`일 때 대리인 서류 행 포함 12개가 `/safety`에 보인다(`agent_flag`가 없으면 11개 — 사양대로) [러너 실측 — e2e:v2]. `CONTRACT_CHECK_RULES`·특약 키워드·`matchSpecialTerms` + `tests/contract-checks.test.ts` 24건(야간 S5). 체크는 `safety_checks` JSONB `k-*` 키. **남은 통과 기준**: 문구 도메인 검수(§5) |
| 6 PWA·오프라인 | manifest · SW · 조사지 오프라인 · 큐 · iOS 실기기 | 비행기 모드에서 조사지 열림 | 부분 — `next start` E2E로 SW 오프라인 이동 확인: 연결 없이 `/property/[id]/sheet` → `/offline?id=` 사본 열림 → 결과 입력이 큐(대기 1)에 쌓이고 온라인 복귀 후 서버 반영(대기 0) [러너 실측 — e2e:v2 prod 빌드]. manifest · `public/sw.js` · 정적 `/offline` · 큐 순수 함수 + `tests/offline-queue.test.ts` 24건(야간 S6). **남은 것**: 실기기(iOS Safari 설치·비행기 모드 · 오프라인 표시 `navigator.onLine` 한계, §7) |
| 7 V1.5·디자인 | V2-PLAN §5 보정 · 디자인 (레퍼런스 — 로고·워드마크·웹페이지 — 강우 준비 완료, 강우 확인 10/5. 머지 뒤 main에서 `feat/design`) | verify · shots | 부분 — **디자인 1차(10/5, `feat/design`)**: 색 토큰(주 행동 brand·활성 dark·배지 teal 분리) · 로고(머리글·탭·PWA·링크 미리보기) · 단계 버튼 4칸 한 줄 + 비교 화면 key 경고 수정(원인: `app/compare/page.tsx`가 넘기는 지도 요소에 key 없음) [러너 실측 — e2e:v2 · shots 10/5]. Must 중 면책 상수화·연도 주입·전월세전환 명칭은 2단계에서 처리(야간 S2). 이름 변경은 1단계. Should(야간 S7): ✅ `lib/session.ts:52` DB 실패 → `SessionStoreUnavailableError` + `app/error.tsx` 명시적 오류 화면(빈 목록 대신, 화면 미실행) · ✅ `addressDetail` 지점 ① 프롬프트 스키마 + normalize(등록 폼은 이미 받음, 실제 모델 응답 미실측) · ⏭ 옵션 4단계+답변 회피 · 건물 상태 · 관리비 포함 체크 — 기존 `VISIT_RULES`(v-option·v-mold·v-window·v-mgmt)·결과값 체계 변경이 필요해 보류(판단 필요) · 사글세 3문항 중 ①만: `mgmtFeeMode` 등록·정보 확인 폼(사글세일 때) + DTO·액션 + 지점 ① 추출(포함·매월 별도만). ①의 "모름 → 질문 자동 생성"·② 보증금 `initialCash` 합산·③ 중도 퇴거 환불 항목은 문구·계산 결정 대기(§6 열린 결정) · 사글세 인쇄 헤더: 이미 `formatPrice`가 보증금+선납(총액·개월)을 넣고 있음을 확인, `tests/format.test.ts`로 고정 · ✅ 선납 상한: 24개월 초과 시 경고만(10/5 강우 결정, §6) — `tests/format.test.ts`로 고정 |
| 나중 | Tesseract · 서버 OCR · 확인 도우미 ⑤ · 로그인 · 공유 링크 | 각각 별도 승인 | — |

**중단 규칙**
1. §4 실측에서 등기부 PDF에 텍스트 레이어가 없으면 3단계를 **확인 화면 수기 입력**으로 좁힌다. OCR 재개는 별도 승인이다
2. 4단계 통과 기준 미달이면 6단계로 넘어가지 않는다
3. 오프라인 범위는 조사지 1화면으로 시작한다 (V2-TECH-REVIEW §4-2)

---

## 4. PDF 텍스트 레이어 실측표 (3단계 선행)

> 채워지기 전에는 텍스트 레이어 유무를 아무 문서에도 적지 않는다 (R8). 측정 방법: pdf.js `getTextContent()`.

| 파일 | 종류 | 텍스트 레이어 | 암호화/권한 | 추출된 핵심 필드 | bbox 계산 | 확인 |
|---|---|---|---|---|---|---|
| | 등기부 PDF (인터넷등기소) | | | /10 | | |
| | 계약서 PDF | | | /10 | | |

---

## 5. 사람이 준비해야 넘어가는 것

| 항목 | 담당 | 필요 단계 | 상태 |
|---|---|---|---|
| 등기부 PDF 1~2건 (인터넷등기소) | 도메인 팀원 | **3단계 전** | 미실측 — 가상 PDF로만 통과. 머지를 막지 않음 (강우 확인 10/5) |
| 계약서 샘플 (표준 양식 + 마스킹 실제 1건) | 도메인 팀원 | **3단계 전** | 미확보 |
| 광고 캡처 2~3장 | 팀 | 4단계 전 | 미확보 |
| **실제 불일치 사례 매물** | 도메인 팀원 | 4단계 | 미확보 |
| 계약서 12항목 문구 검수 | 도메인 팀원 | 5단계 전 | 미확보 |
| iOS 실기기 1대 (PWA 저장소 확인) | 강우 | 6단계 | 미확보 |
| PWA 아이콘 | 강우 | 6단계 | 반영 — `brand/` 원본(로고 2종·집 아이콘)에서 생성 (디자인 1차, 10/5). 실기기 설치 아이콘·마스크 잘림은 미확인 |
| 디자인 레퍼런스 | 강우 | 7단계 | 준비됨 — 로고·워드마크·웹페이지, 강우가 준비 (강우 확인 10/5) |
| 새 서비스명 상표·도메인 중복 확인 | 팀 | 1단계 전 | 미확인 |
| 도메인 바꾸면 카카오 콘솔(앱 1540296)·Vercel 도메인 등록 | 강우 | 1단계 | — |
| 카카오 REST·JS 키 | 강우 | — | 로컬 `.env.local`에는 넣음. 프리뷰·운영 도메인 등록 여부 미확인 (강우 확인 10/5). 키가 없으면 지도는 리스트·좌표는 `null`로 R4 폴백(9/30 `qa:seed`에서 폴백 동작 확인) |

---

## 6. 지금 열려 있는 결정

| 안건 | 메모 | 필요 단계 |
|---|---|---|
| 스키마 최종 필드 (V2-PLAN §4-1 표) | 개발+도메인 | 2단계 |
| 저장소명·도메인 변경 여부 | 바꾸면 카카오 콘솔·Vercel 재등록이 따라온다 | 1단계 |
| 사글세 3문항 문구 | 도메인 | 7단계 전 |
| Gemini 무료 티어 데이터 정책 → 마스킹 범위 | 구조화로 텍스트를 보내므로 v1보다 중요하다. 현재 마스킹은 주민번호·생년월일(표지 있는 것)만 — **성명·주소·금액은 그대로 전송**(대조에 필요) | 3단계 |
| ④ 입력 글자 수 상한 | API-V2 §0-1대로 실측 전이라 두지 않았다. 샘플 PDF 텍스트 길이 실측 후 정한다 | 3단계 |
| `lien_total`·`seizure_flags` 의미 | 텍스트 레이어는 말소(취소선)를 구분하지 못한다. 현재는 "보이는 표기를 쉼표로 옮겨 적기"(합산 안 함) — API-V2 §1의 "합산"을 누가·어디서 할지 | 4단계 전 |
| 한글 금액 ↔ 숫자 금액 우선순위 (법적 근거) | 확인 전까지 "다릅니다"만 표시 (R8) | 4단계 전 |
| `needs_review`를 주소 밖에도 쓰는가 (야간 S4) | 스키마 주석은 "주소 표기 차이 전용". S4는 단위를 모르는 금액(`500`)·평↔㎡·가린 성명(`홍○○`)·공유자 일부 일치·용도 괄호 보충·면적 반올림 표기도 `needs_review`로 보냈다 — `different`(오탐)·`same`(놓침) 둘 다 피하려고. 다른 선택지: 새 상태 추가(스키마·API 계약 변경) | 4단계 |
| A′ 질문 대상 상태 (야간 S4) | API-V2 §5-1은 `different`·`needs_review`·`missing_not_found`를 받게 열어 뒀지만, 뒤의 둘에 "다릅니다" 템플릿은 틀린 문장이라(R10) 지금은 `different`만(`QUESTION_STATUSES`). 두 상태용 문구를 정하면 넓힌다 | 4단계 |
| 보증보험이 월세·사글세 보증금에 적용되는지 | 조건 분기 없이 "해당 없음" 선택지로 처리 중 | 5단계 전 |
| 계약서 12항목 자동 채움 범위 (야간 S5) | 대조 결과가 `same`이어도 체크를 대신 찍지 않고 옆에 보여 주기만 한다(R1). "목적물 표시"의 **용도**는 계약서 추출 칸이 없어 연결하지 않았다(소재지·면적만). 월세 항목은 거래 유형 분기 없이 전세에도 보인다. 이사 날짜는 비교만 하고 저장하지 않는다. 특약 키워드 목록(`SPECIAL_TERMS_KEYWORDS`)은 도메인 검수 대기 — 특히 `해제`·`담보`는 넓다 | 5단계 |
| 주택임대차보호법 2년 보장 조문 번호·문구 | 용어 설명 출처용 | 5단계 전 |
| 오프라인 범위 (조사지만 / 방문 기록까지) | 야간 S6: **조사지 열람 + 직접 확인 항목의 결과·메모 입력까지.** 질문 답변 입력·방문 기록 화면 전체의 오프라인은 "나중". 온라인에서 이미 연 방문 기록 화면이 저장 중 끊기면 기존처럼 오류 표시(입력은 화면에 남음)이고 큐로 우회하지 않는다 | 6단계 |
| `ADMIN_TOKEN` | **결정됨** — 유지. 삭제하지 않고 URL만 노출하지 않는다 | — |
| 평 환산 방식 | **결정됨 (10/5 강우, B안)** — 평↔㎡만 `400/121`로 환산해 평 표기 자릿수로 반올림 비교. 맞으면 `same`, 아니면 `needs_review`, `different`는 내지 않음. INFRA 결정 로그 10/5 | — |
| 선납 상한 개월 수 | **결정됨 (10/5 강우)** — 24개월 초과 시 경고만, 입력·저장 차단 없음. 24는 법정 수치가 아닌 오타 경고용 상수(`PREPAID_MONTHS_CHECK_OVER`), 도메인 팀원 확인 후 변경 가능. INFRA 결정 로그 10/5 | — |

---

## 7. 미확인 (R8 — 추측 금지)

**v1에서 물려받은 것** — 한도에 닿으면 조용히 폴백으로 내려가고, 출처 배지가 `AI` → `규칙 기반`으로 바뀌는 것이 신호다.

- Gemini 무료 티어 RPM/RPD
- 카카오 로컬 API 일일 한도 (지도 SDK와 별개 쿼터) · 상업적 이용 조건
- 우편번호 서비스 사용 조건·한도

**v2에서 생긴 것**

| 항목 | 확인 방법 | 필요 단계 |
|---|---|---|
| 등기부 PDF 텍스트 레이어·암호화 여부 | pdf.js `getTextContent()` (§4) | 3단계 전 |
| 표 칸 안 줄바꿈이 추출문 낱말을 가르는지("시↵험로 45") · 그래도 지점 ④가 값을 복원하는지 — 가상 PDF에선 갈라졌고 ④는 복원함(9/30 `e2e:v2`). **실제 등기부로 확인할 때까지 보류** | 실제 등기부 PDF 추출문 대조 | 3단계 |
| **말소사항 오독 위험** — 등기부 "말소사항 포함"본은 말소된 소유자·근저당·전세권을 **취소선으로만** 표시한다. PDF 텍스트 추출에서는 취소선이 사라지므로 ④가 과거 소유자를 현재 소유자로 읽거나(→ 틀린 "다르게 기재", R1 오탐) 말소된 근저당을 `lien_total`에 넣을 수 있다. 대응 후보: (a) 문서 화면에 "현재 유효사항으로 발급" 안내 (b) 추출문에 "말소사항 포함"이 있으면 경고 (c) 갑구의 마지막 소유권 기록만 쓰도록 ④ 프롬프트 보강. **코드는 아직 고치지 않는다** — 실제 PDF 실측 후 결정. (a) 안내 적용 — 10/5, (b)(c)는 실측 후 | 실제 등기부 PDF(말소사항 포함본·현재 유효사항본 각 1건) 추출문 대조 (§4) | 3단계 |
| **등기부 구조 — ④가 골라야 하는 값** — 실제 등기부 1건에서 본 구조: 공유자 2명(지분 각 1/2) · 1동 전체 층별 면적과 전유부분 면적이 한 문서에 공존 · 지번 주소와 도로명 주소가 별도 행. ④는 **전유부분 면적**을 `area_exclusive`로 골라야 하고, 소유자가 둘이면 `owner_name`↔`lessor_name` 대조가 어떻게 되는지도 확인 대상 | 같은 PDF로 ④ 구조화 결과 확인 (§4) | 3단계 |
| **면적 병기 표기** — 광고에 흔한 `33㎡(10평)`처럼 두 단위가 같이 적힌 표기는 파싱되지 않아 항상 확인 필요(`needs_review`)로 간다(원문이 똑같을 때만 `same`, `tests/compare.test.ts`로 고정). 개선 여부 결정 대기 | 강우 결정 | 4단계 |
| 390px 확인 화면 '매물 별칭' 넘침이 9/30 v2 촬영에서는 3건, 10/5 촬영에서는 0건. 그 사이 이 부분을 고친 커밋은 확인되지 않음. 측정 조건 차이(카카오 키 유무, 시드 데이터)일 수 있음 [추정]. **고쳐진 것으로 적지 않는다** | 같은 조건으로 재촬영 비교 (`npm run shots`) | 7단계 |
| Gemini 무료 티어 입력 데이터 활용 정책 | 공식 문서 | 3단계 |
| iOS Safari PWA 저장소 회수 동작 | 실기기 1대 | 6단계 |
| **프리뷰가 어느 DB를 쓰는지 미확인.** Vercel에 Preview(`feat/v2`) 전용 `DATABASE_URL`을 추가했으나, 프리뷰에서 등록한 매물이 dev DB에서 조회되지 않았다(강우 확인 10/5). 해결 전까지 프리뷰 주소에서 데이터를 만들지 않는다. `feat/design` 프리뷰에도 같은 문제가 있다. 담당 강우 | Vercel 프로젝트 환경 변수(Preview) · 브랜치 범위 | 7단계 |
| **실기기 확인(PWA 설치·오프라인)은 머지 전에 하지 않았다.** 머지 뒤 운영 주소에서 강우가 확인한다 | 실기기 1대 · 운영 주소 | 6단계 |
| prep 매물에서 `/record`·`/safety`를 URL로 직접 열면 머리글 A·B에 ✓가 붙는다(위치 기준 표시). 화면에서는 잠겨 있어 URL로만 재현된다. 문서 화면은 `ffa4eec`에서 상태 기준으로 고쳤다. 나머지는 디자인 단계에서 머리글을 손볼 때 같이 본다 | prep 매물로 두 URL 직접 열기 | 7단계 |
| 와이파이는 붙어 있는데 인터넷이 안 되면 오프라인 표시가 안 뜬다(`navigator.onLine` 한계). 대기 건수는 보이므로 유실은 아님. 실기기에서 확인 후 개선 여부 결정 | 실기기 1대 | 6단계 |
| (보류 경로) 촬영본 OCR 인식률·처리 시간 | 재개 시 V2-TECH-REVIEW §2-3 양식 | 나중 |
| (보류 경로) Gemini 이미지 입력 쿼터 · Vercel `maxDuration` 대비 응답 시간 | 재개 시 실호출 | 나중 |

---

## 8. V1.5 보정

→ `V2-PLAN.md` §5 (중복 제거, 2026-09-29). 진행 상태는 §3의 7단계에서 추적한다.
