# V2-STATUS.md — Sealook Homes(씰룩홈즈) 진행 스냅샷

> **이 문서의 용도**: 새 채팅·새 세션이 "지금 어디까지 됐나"를 여기서만 읽는다.
> **움직이는 사실(일정·진행·미확인·준비물·열린 결정)은 이 문서에만 둔다.** 고정된 사실(범위·제약·실측값)은 `V2-PLAN.md` · `V2-TECH-REVIEW.md`에만.
> 단계가 끝날 때마다 갱신한다. v1 완료 시점 스냅샷은 `docs/v1/PROJECT-STATUS.md`(기록).
> 값에는 확인 상태를 붙인다: `[러너 실측+경로]` `[코드 경로+커밋]` `[설계 의도—미구현]` `[추정]`
> 마지막 갱신: 2026-09-29

---

## 1. 한 줄

목표는 **대구대 실배포 + 포트폴리오 완성도.** 공모전 출품은 포기했다(2026-09-29). 마감이 없으므로 일정은 날짜가 아니라 **단계 순서**다.
v2 범위 확정(9/3)과 규칙 정리까지 끝났고, **v2 코딩은 시작하지 않았다.** 다음은 0단계 하네스.

---

## 2. 레포 실측 (2026-09-29)

| 항목 | 상태 | 확인 |
|---|---|---|
| `main` 마지막 커밋 | `f2d3ed1` (2026-09-09). 이후 v2 코드 커밋 없음 → **v2 코딩 0일** | [코드 경로+커밋 f2d3ed1] |
| 원격 브랜치 | `main` · `feat/screens`(v1) 뿐. `feat/v2-api` · `feat/v2-screens` 없음 | [코드 경로+커밋 f2d3ed1] |
| 로컬 브랜치 | `feat/v2-api` = `main`(f2d3ed1). `feat/v2-screens` = 4466fd5 — **main보다 5커밋 뒤**. 둘 다 자체 커밋 0 → 강우가 지우고 main에서 다시 딴다 | [코드 경로+커밋 f2d3ed1] |
| `lib/ai/touchpoints.ts` | 있음 (야간 S2). ①②③④ active · ⑤ planned (④는 야간 S3). ①~④ 라우트가 이 id로 `ai_logs.touchpoint` 기록 | [코드 경로 — 야간 S3 커밋] |
| `lib/client/` | 있음 (야간 S3). `vault.ts`(IndexedDB 원본) · `pdf-text.ts`(pdfjs-dist 동적 import) · `document-api.ts`(④ 호출·마스킹·본문 크기 확인) | [코드 경로 — 야간 S3 커밋] |
| `lib/compare/` | 있음 (야간 S4). `normalize`(금액·한글 금액·면적·층·날짜·성명) · `pairs`(대조 쌍 = 결과 순서) · `compare`(status 산출) · `text`(결과 문장) · `question`(A′ 템플릿). 평↔㎡ 환산 없음(상수 없음) → 평 표기는 `needs_review`. `tests/compare.test.ts` 148건 | [러너 실측 — 야간 S4 커밋] |
| pdf.js 자산 | `pdfjs-dist` 6.3.289. worker `public/pdfjs/pdf.worker.min.mjs` **1,265,413 B** 자체 호스팅 + 라이브러리(`pdf.min.mjs` 기준) **458,705 B** = 약 **1.72 MB** (예산 2.0MB 안). Korean CMap(176,242 B)은 미포함 — 실측 후 결정 | [러너 실측 — 파일 크기] · 번들 청크 크기는 `next build` 미실행 |
| `docs/API-V2.md` | 있음 (야간 S2 최초 작성). 이후 변경은 승인 | [코드 경로 — 야간 S2 커밋] |
| 마이그레이션 `drizzle/0002_steep_warlock.sql` | 생성만 함. **DB 미적용.** CREATE TABLE 3 · ADD COLUMN(nullable) 2 · FK 3 · INDEX 3. DROP · ALTER TYPE · 기존 컬럼 NOT NULL 없음 | [코드 경로 — 야간 S2 커밋] |
| `public/tessdata/` | 없음 — Tesseract 보류로 **만들지 않는다** | [코드 경로+커밋 f2d3ed1] |
| `public/manifest.json` · `sw.js` | 있음 (야간 S6). SW 직접 작성 — 캐시는 `/offline` 셸·그 청크·manifest·아이콘만. API·RSC·매물 HTML·원본은 캐시 안 함. 아이콘은 `app/icon.png`(512) 임시 | [코드 경로 — 야간 S6 커밋] · 설치·오프라인 동작은 실기기 미확인 |
| `.claude/settings.json` | 9/9부터 로컬에만 있었고 `.gitignore`의 `.claude/`로 **미추적**이었다 → 2026-09-29 추적 전환 | [코드 경로+커밋 — 이번 커밋] |
| `.claude/settings.local.json` | 없음 (개인 설정 없음). 생기면 무시 대상 | [코드 경로+커밋 — 이번 커밋] |
| CI (`.github/workflows`) | 없음 | [코드 경로+커밋 f2d3ed1] |
| `screenshots/v1-baseline/` | 없음 (`screenshots/` 자체가 없다) → `npm run shots` 비교가 성립하지 않는다 | [코드 경로+커밋 f2d3ed1] |
| `npm run verify` 정의 | `next typegen && tsc --noEmit` → `eslint` → `vitest run`. CLAUDE.md와 일치 | [코드 경로+커밋 f2d3ed1] |
| 서비스명 | **Sealook Homes(씰룩홈즈)** 로 교체(1단계, 표시명만). 남은 옛 이름: `.claude/settings.json` `$comment`(쓰기 권한 없음) · `docs/PORTFOLIO-NOTES.md:1`(deny 대상) · `tests/e2e/gen-icon.mts:25`(아이콘 팀원 대기) · INFRA 결정 로그(과거 기록) | [코드 경로 — 1단계 커밋] |
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
| **0 하네스** | `.claude/settings.json` 추적(완료) · CI(verify) · `screenshots/v1-baseline/` 촬영 · 로컬 브랜치 재생성 | CI 초록 · 베이스라인 파일 존재 | 진행 중 (settings.json만 완료) |
| 1 이름 교체 | 옛 이름 → Sealook Homes(씰룩홈즈). 화면·메타·PDF 파일명(`SealookHomes_`) · 끊긴 주석 경로(§2). README는 저장소에 없음 | verify 통과 · shots 비교 | 부분 — verify 통과, shots·OG 렌더 미확인(야간 S1) |
| 2 스키마·계약 | 스키마·마이그레이션(승인) · `touchpoints.ts` · `docs/API-V2.md` | verify 통과 · 마이그레이션 승인 기록 | 부분 — verify 통과, 마이그레이션 생성·미적용(강우 검토 후 `db:migrate`). V1.5 Must 3건(면책 상수화 · 연도 주입 · 전월세전환 명칭)도 함께 처리 (야간 S2). ⚠ `properties` 컬럼 추가 → **마이그레이션 적용 전 배포 금지** |
| 3 PDF 추출·구조화 | pdf.js 텍스트 레이어 추출 · 지점 ④ 구조화 + 마스킹 · 확인 화면 | 등기부 PDF 1건 필드 채워짐 (§4 실측표 선행) | 부분 — 코드·단위 테스트 완료, verify 통과(야간 S3). `/property/[id]/documents` 화면(업로드 → 원본 IndexedDB → 텍스트 레이어 → ④ → 전 필드 확인 → `saveDocument`) · 준비 상태 패널. **통과 기준 미확인**: 샘플 PDF 없음 → §4 미실측, DB 마이그레이션 미적용이라 저장 경로 미실행 |
| 4 대조 | `lib/compare` + 테스트 · 대조 결과 화면 · A′ 질문 연결 | **2종 대조에서 불일치 ≥1 검출·표시** | 부분 — `lib/compare` + 테스트 148건, verify 통과(야간 S4). `runCompare`(전량 삭제 후 재삽입)·`listDiscrepancies` · 문서 화면 하단 대조 결과(나란히·면책 상시·원본 PDF 1개 + bbox일 때만 위치 표시) · 조사지 "문서에서 확인된 차이"(different만, 규칙 템플릿 → 선택 시 지점 ②, 인쇄에 질문만). **통과 기준 미확인**: DB 마이그레이션 미적용·실제 불일치 사례 없음 → 화면에서 검출·표시 미실행. 읽을 수 없는 표기(단위 없는 금액·평·가린 성명 등)를 `needs_review`로 보내는 결정은 승인 대기 |
| 5 계약서 12항목 | V2-PLAN §4-6 규칙 · 안전 점검 화면 | 12항목 표시 · 문구 검수 완료 | 부분 — `lib/rules.ts` `CONTRACT_CHECK_RULES`(표 문장 그대로 12개)·특약 키워드 상수·`matchSpecialTerms` + `tests/contract-checks.test.ts` 24건, verify 통과(야간 S5). `/safety` 계약서 섹션(규칙 기반 배지·체크는 사용자만·대조 결과/추출 값은 옆에 표시·특약은 서버에서 매칭 결과만 전달·대리인 3종은 `agent_flag` "true"일 때만·보증보험 확인함/못함/해당 없음). 체크는 `safety_checks` JSONB에 `k-*` 키로 저장(스키마 변경 없음). **통과 기준 미확인**: 문구 도메인 검수 전 · 화면 미실행(DB 마이그레이션 미적용) |
| 6 PWA·오프라인 | manifest · SW · 조사지 오프라인 · 큐 · iOS 실기기 | 비행기 모드에서 조사지 열림 | 부분 — verify 통과(야간 S6). manifest · `public/sw.js`(연결 없으면 `/property/[id]/sheet·record` → `/offline?id=`) · 정적 `/offline` 화면(조사지·방문 기록 화면을 온라인에서 열 때 IndexedDB에 둔 사본으로 열람 + 결과·메모 입력) · 입력 큐 `lib/offline/queue.ts` 순수 함수(순서·재시도 3회 후 멈춤·충돌·항목당 900KB) + `tests/offline-queue.test.ts` 24건 · 온라인 복귀 시 `saveVisitResults` 한 건씩 · 헤더 오프라인/대기 건수. **통과 기준 미확인**: `next build`·실기기(iOS Safari 설치·비행기 모드) 미실행 |
| 7 V1.5·디자인 | V2-PLAN §5 보정 · 디자인 (**팀원 레퍼런스 대기**) | verify · shots | 부분 — Must 중 면책 상수화·연도 주입·전월세전환 명칭은 2단계에서 처리(야간 S2). 이름 변경은 1단계. Should(야간 S7): ✅ `lib/session.ts:52` DB 실패 → `SessionStoreUnavailableError` + `app/error.tsx` 명시적 오류 화면(빈 목록 대신, 화면 미실행) · ✅ `addressDetail` 지점 ① 프롬프트 스키마 + normalize(등록 폼은 이미 받음, 실제 모델 응답 미실측) · ⏭ 옵션 4단계+답변 회피 · 건물 상태 · 관리비 포함 체크 — 기존 `VISIT_RULES`(v-option·v-mold·v-window·v-mgmt)·결과값 체계 변경이 필요해 보류(판단 필요) · 사글세 3문항 중 ①만: `mgmtFeeMode` 등록·정보 확인 폼(사글세일 때) + DTO·액션 + 지점 ① 추출(포함·매월 별도만). ①의 "모름 → 질문 자동 생성"·② 보증금 `initialCash` 합산·③ 중도 퇴거 환불 항목은 문구·계산 결정 대기(§6 열린 결정) |
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
| 등기부 PDF 1~2건 (인터넷등기소) | 도메인 팀원 | **3단계 전** | 미확보 |
| 계약서 샘플 (표준 양식 + 마스킹 실제 1건) | 도메인 팀원 | **3단계 전** | 미확보 |
| 광고 캡처 2~3장 | 팀 | 4단계 전 | 미확보 |
| **실제 불일치 사례 매물** | 도메인 팀원 | 4단계 | 미확보 |
| 계약서 12항목 문구 검수 | 도메인 팀원 | 5단계 전 | 미확보 |
| iOS 실기기 1대 (PWA 저장소 확인) | 강우 | 6단계 | 미확보 |
| PWA 아이콘 | 강우 | 6단계 | 미확보 |
| 디자인 레퍼런스 | 팀원 | 7단계 | 대기 |
| 새 서비스명 상표·도메인 중복 확인 | 팀 | 1단계 전 | 미확인 |
| 도메인 바꾸면 카카오 콘솔(앱 1540296)·Vercel 도메인 등록 | 강우 | 1단계 | — |

---

## 6. 지금 열려 있는 결정

| 안건 | 메모 | 필요 단계 |
|---|---|---|
| 스키마 최종 필드 (V2-PLAN §4-1 표) | 개발+도메인 | 2단계 |
| 저장소명·도메인 변경 여부 | 바꾸면 카카오 콘솔·Vercel 재등록이 따라온다 | 1단계 |
| 사글세 3문항 문구 · 선납 상한 | 도메인 | 7단계 전 |
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
| Gemini 무료 티어 입력 데이터 활용 정책 | 공식 문서 | 3단계 |
| iOS Safari PWA 저장소 회수 동작 | 실기기 1대 | 6단계 |
| (보류 경로) 촬영본 OCR 인식률·처리 시간 | 재개 시 V2-TECH-REVIEW §2-3 양식 | 나중 |
| (보류 경로) Gemini 이미지 입력 쿼터 · Vercel `maxDuration` 대비 응답 시간 | 재개 시 실호출 | 나중 |

---

## 8. V1.5 보정

→ `V2-PLAN.md` §5 (중복 제거, 2026-09-29). 진행 상태는 §3의 7단계에서 추적한다.
