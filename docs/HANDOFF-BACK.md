# HANDOFF-BACK — 백엔드 세션 인수인계

> 작성: 2026-08-11 (D3 배포 완료 시점) · 대상: 이 저장소의 **백엔드 세션**을 이어받는 다음 세션
>
> **읽는 순서**: `CLAUDE.md` → 이 문서 → `docs/INFRA.md`
> 이 셋만 읽으면 바로 작업할 수 있게 썼다. PRD는 필요할 때 해당 절만 펴 보면 된다.

---

## 1. 담당 범위

### 쓰기 허용

```
app/**                 라우트 · 페이지 · 클라이언트 경계 · API 라우트
lib/actions/**         Server Actions
lib/ai/**              Gemini 클라이언트 · 프롬프트 · 정규화
lib/geocode.ts         주소→좌표
lib/session*.ts        익명 세션
lib/types.ts           API 계약 DTO
components/map/**      지도 (프론트가 스타일만 손댄 적 있음 — 아래 참조)
db/**                  스키마 · 클라이언트 · 마이그레이션
tests/**               유닛 테스트
proxy.ts               세션 쿠키 발급
docs/INFRA.md          공통 기억 (프로젝트 채팅과 공유)
```

### 쓰기 금지

| 대상 | 이유 |
|---|---|
| **`components/screens/**`** | **프론트 세션이 별도 worktree(`E:/project/recheck-front`, `feat/screens` 브랜치)에서 동시 작업 중.** 여기를 고치면 병합 충돌이 나고, 더 나쁘게는 상대 세션이 모르는 채로 덮어쓴다 |
| `lib/rules.ts` · `lib/finance.ts` · `lib/geo.ts` · `db/schema.ts` | 확정 파일. **값·로직 변경 전에 반드시 사용자 승인.** 단 "사실관계가 틀린 상수"는 수정 대상이다(§5-①) |
| `docs/PRD.md` | 기획 단일 소스. 문구 수정도 사용자 승인 후 |
| `CLAUDE.md` | 사용자가 직접 관리. 세션 중 수정된 채로 보이면 **스테이징하지 말 것** |

### 프론트와의 인터페이스

- 화면은 **props로만** 데이터를 받는다. `app/**/page.tsx`는 데이터를 가져와 넘기는 **서버 컴포넌트**로만 쓴다.
- 화면이 `@/lib/actions/*`의 **타입을 직접 import** 한다(`import type { CreatePropertyInput }`). 그래서 시그니처 불일치가 0건이었다. **Server Action 시그니처를 바꾸면 화면이 즉시 깨진다** — 바꾸기 전에 프론트 세션에 알릴 것.
- 프론트가 `components/map/*`의 **스타일만** `--rc-` 토큰으로 바꾼 적이 있다(동작은 그대로). 지도 파일을 고칠 때 스타일 부분은 존중할 것.

---

## 2. 현재 상태

### 완료

| 영역 | 상태 |
|---|---|
| 인프라 | Next 16.3 / React 19.2 / Tailwind v4 / shadcn(radix-nova) / Neon+Drizzle |
| DB | 마이그레이션 1건 적용. 테이블 5 · 인덱스 4. **현재 완전히 빈 상태** |
| 세션 | `proxy.ts`가 쿠키 발급 → `lib/session.ts`가 `users` 행 보장 |
| Server Actions | CRUD · 상태 전이 · 조사지 · 질문 · 점검 · 금융 전부 구현 |
| API 라우트 | `/api/geocode` · `/api/ai/{parse,questions,summary}` — **전부 실패해도 200 + `{ok:false}`** |
| 지도 | 카카오 SDK + 리스트 폴백. `components/map/README.md`에 사용법 |
| 라우팅 | 9화면 전부 연결 (홈·등록·확인·조사지·기록·비교·안전점검·계약후) |
| 배포 | https://recheck-home.vercel.app — 자동 배포. 시나리오 8단계 200 확인 |
| 테스트 | `vitest` 114건 (DB 불필요, 항상 실행 가능) |

### 검증된 것 (실측)

- 배포본 AI 3종 정상 — `geocode` 1.2s / `parse` 1.0~1.6s / `questions` 5.6s
- 카카오 도메인 제한 작동 — 등록 도메인 200, 미등록 401 `domain mismatched!`
- 익명 세션 요청별 분리, `Secure; HttpOnly; SameSite=lax`
- R7: `addressDetail`이 확인 화면 편집란 외에는 값이 비어 있음(페이로드 포함)

---

## 3. 미해결 — 다음 세션이 이어받을 것

| # | 항목 | 상태 |
|---|---|---|
| 1 | **동시 요청 중복** — 서버는 막지 않는다 | `createProperty`·`addVisitCheck`·`toggleBankQuestion`을 동시에 2번 부르면 2건 생긴다. **클라이언트 가드(`useSingleFlight`)에만 의존.** 사용자가 "발표까지 사흘이라 스키마 마이그레이션 리스크를 지지 않는다"고 결정 — 유니크 제약을 넣으려면 재승인 필요 |
| 2 | **Gemini 무료 티어 RPM/RPD** | 미확인. 공식 문서에서 못 찾았고 실측도 안 했다. **이 값에 의존하는 제한 로직을 넣지 말 것** (R8) |
| 3 | **카카오 로컬 API 일일 한도** | 미확인. 지도 SDK의 300,000회는 **로컬 API에 적용되지 않는다.** `lib/geocode.ts` 상단 주석 유지 |
| 4 | 카카오 우편번호 서비스 사용법 | 미확인 (INFRA.md 미체크) |
| 5 | `components/screens/` "경산캠퍼스" 표기 | `README.md` 5곳 + `recheck-theme.css` 주석 1곳. **프론트 담당** — 기준점 표기는 `대구대학교`로 통일됐다 |
| 6 | `age` 현실적 상한 | int4 상한(21억)까지만 막는다. `99999년차`도 통과. 화면 검증 영역이라 서버는 DB 한계까지만 |
| 7 | 브라우저 필요 항목 | 지도 타일 렌더 · 인쇄 미리보기 2종 · 실제 클릭 플로우 — §7 참조 |

---

## 4. D4에 사용자가 해야 할 것 (코드 아님)

`docs/INFRA.md` §5 D4 리허설 체크리스트에 있다. 특히:

- **Neon 웜업** — scale-to-zero라 발표 직전 1회 접속 필요
- **저장소 public 전환**(코드 공개 시) — 전환 **전에** `git log --all --pretty=format: --name-only | sort -u | grep -i env`로 히스토리 감사

---

## 5. 코드만 봐서는 알 수 없는 판단 — 백엔드

### ① "확정 파일"은 설계 보호이지 오류 보존이 아니다

`lib/geo.ts`의 `SCHOOL_ORIGIN`이 **추정 좌표**였고 실제 캠퍼스와 **3.9km** 어긋나 있었다. 정문 주소를 지오코딩하니 "정문에서 3.4km"가 나와 발견했다.

확정 파일이지만 **사실관계가 틀린 상수는 수정 대상**이라고 판단해 사용자 승인 후 교체했다. 출처(카카오 로컬 API 조회, 2026-08-11)를 주석에 남겼고, `tests/geo.test.ts`가 좌표와 표기를 함께 고정해 조용한 변경을 막는다.

> **교훈**: 확정 파일의 값이라도 실측으로 검증할 수 있으면 해라. "확정"은 임의 변경 금지이지 검증 면제가 아니다.

### ② 표기는 "대구대학교", 좌표는 캠퍼스 중심 — "정문"으로 되돌리지 말 것

기준점은 **경산캠퍼스 대표 좌표(POI 중심)**이고 정문이 아니다. 화면 표기만 짧게 `대구대학교`로 정했다. 기준이 아닌 지점을 기준이라 표기하면 사실과 달라진다(R8). 테스트가 `name`에 `정문`이 들어가면 실패시킨다.

### ③ Server Action은 예외 대신 `ActionResult`를 돌려준다

PRD §8.4의 "위반 시 400"은 Route Handler를 전제로 쓴 문구인데 실제 구현은 Server Action이라 HTTP 상태 코드를 돌려줄 자리가 없다. **비전공 프론트가 `try/catch` 없이 `ok`만 분기**하게 하려는 R4 정신에 맞춰 `{ok,error}`로 통일했고, PRD·CLAUDE.md 문구도 함께 고쳤다.

**그래서 액션 안에서 예외가 새면 계약이 깨진다.** 실제로 그런 적이 있다(§5-④).

### ④ 입력 상한은 DB에 닿기 전에 막는다

`price`에 `2147483648`을 넣으면 Postgres가 예외를 던지고, 그러면 액션이 `ActionResult` 대신 **예외를 밖으로 내보내** 프론트가 에러 바운더리(흰 화면)를 만난다. 보증금 칸에서 0을 길게 누르면 재현됐다.

`lib/actions/properties.ts`의 `checkLimits()`가 INSERT/UPDATE 전에 거른다.

```
price·deposit·mgmtFee·age   int4   2,147,483,647
area                        numeric(6,2)  9999.99
name 60자 / floor 6자        DB 제한은 없지만 화면이 감당 못 한다
```

**음수는 상한과 다르게 다룬다** — `toInt`가 0으로 보정한다. "-5를 입력했더니 저장이 안 된다"보다 "0으로 들어갔다"가 덜 막힌다.

> **새 필드를 추가할 때 반드시 `checkLimits()`에 넣을 것.** 안 넣으면 같은 예외가 재발한다.

### ⑤ `proxy.ts` matcher에서 `/api/**`를 제외한 이유

proxy가 **모든** 요청에 세션 쿠키를 발급하면 API 라우트의 세션 검사가 항상 통과해 **보호처럼 보이는 죽은 코드**가 된다. 실측으로 확인했다. API 라우트는 우리 카카오·Gemini 키로 외부 API를 호출하므로, 배포 URL을 아는 누구나 쿼터를 소진시킬 수 있는 상태를 남기지 않았다.

화면은 항상 페이지를 먼저 거치므로 정상 사용자는 이미 쿠키를 갖고 있다.

matcher는 `api`가 아니라 **`api/`**로 제외한다 — `api`로 하면 `/apiary` 같은 페이지 경로까지 제외된다.

### ⑥ 지도에 `toMapProperties()`를 거치는 이유 / 화면에 `withoutAddressDetail()`을 거치는 이유

**클라이언트 컴포넌트에 넘긴 props는 통째로 RSC 페이로드에 직렬화돼 페이지 HTML 소스에 남는다.** 렌더되지 않아도 소스에는 있다.

- 지도: `toMapProperties()`로 6개 필드만 투영 → 페이지 HTML 12,890B → 9,169B (약 29% 감소)
- 화면: `app/_lib/property.ts`의 `withoutAddressDetail()`로 동/호수 제거. **정보 확인 화면만 예외** — 거기서 사용자가 직접 편집한다

R7 문언상("렌더링하지 않는다") 위반은 아니지만, 발표에서 개인정보 질문이 나왔을 때 "소스에는 남습니다"라고 답하지 않으려고 막았다.

> **새 화면을 붙일 때 `page.tsx`에서 이 두 함수를 거치는지 확인할 것.**

### ⑦ Gemini — 모델·토큰·파서에 각각 함정이 있다

세 가지 모두 **실호출로만 발견됐다. 코드만 봐서는 안 나온다.**

1. **`gemini-2.5-flash` / `-lite`는 쓸 수 없다.** `generateContent`가 404 `"no longer available to new users"`를 반환한다. 사용자가 5월 기준 지식으로 지정했던 모델이다. 현재 `gemini-3.5-flash` / `gemini-3.5-flash-lite`.
2. **`*-latest` 별칭을 쓰지 않는다.** 자동 갱신이라 발표 당일 동작이 바뀔 수 있고, 측정에서 5~6초대로 타임아웃에 근접했다.
3. **추론(thinking) 토큰이 `maxOutputTokens`에 함께 계산된다.** 실측 `thoughtsTokenCount 803` + 답변 65 = 868/1024. 답변이 조금만 길어지면 잘리고, **잘린 JSON은 파싱에 실패해 "AI는 응답했는데 결과 0건"**이 된다. 상한 4096 + `finishReason !== 'STOP'`이면 실패로 보고 다음 모델로 넘긴다.
4. **모델이 JSON 끝에 닫는 괄호를 하나 더 붙인다**(실제 관측). `parseJson`이 괄호 균형 스캔으로 잘라낸다.

타임아웃은 8초 → **12초**. 실측 `parse` 6.1초라 여유가 1.9초뿐이었다. 폴백이 있으므로 늘려도 최악은 템플릿 질문이다.

**모델을 `flash-lite`로 바꾸지 말 것** — 빠르지만 질문 품질이 떨어지고, 우려→질문 변환은 R3의 핵심이라 품질을 포기할 자리가 아니다.

### ⑧ 금융 계산에 기회비용을 넣지 않는다

전세는 큰 돈이 묶여 기회비용이 빠진 월 주거비가 실제 부담보다 작아 보인다.

```
월세 A: 월 주거비 50만 / 초기 자기자금   500만
전세 B: 월 주거비 17만 / 초기 자기자금 4,500만
기회비용 3% 가정 시   51.3만  vs  28.3만   (3배 → 1.7배로 좁혀짐)
```

**그래도 계산에 넣지 않았다.** 기회비용률은 사용자마다 다른 가정값이고, 서비스가 그 숫자를 정하면 "이 서비스의 기준"이 된다(R8·R1). 대신 `FINANCE_ASSUMPTIONS`에 **"반영하지 않았다"고 명시**했다. 계산이 *무엇을 하지 않는가*를 적지 않으면 사용자는 들어 있다고 가정한다.

`lib/finance.ts` 수정은 이때 딱 한 번, **계산 로직 변경 없이 문구만** 보강했다(사용자 승인).

### ⑨ 일괄 저장은 `SELECT` → 병합 → `UPSERT` 2회 왕복

**Neon HTTP 드라이버에는 트랜잭션이 없다.** 항목마다 UPDATE를 날리면 12항목에 12왕복이 된다. `saveVisitResults`·`saveAnswers`가 이 패턴을 쓴다. 입력에 없는 항목은 건드리지 않으므로 화면이 일부만 보내도 안전하다.

### ⑩ 남의 매물은 "권한 없음"이 아니라 "없는 것"

`"권한이 없습니다"`는 그 id의 매물이 **존재한다는 사실**을 알려준다. 전부 `NOT_FOUND`로 통일했다(`lib/actions/_shared.ts`).

### ⑪ 조사지 재생성은 사용자 기록을 지우지 않는다

조건(연식·난방·층수·거래유형·보증금)이 바뀌면 조사지를 재생성하는데, **결과·메모가 입력됐거나 `ruleId='custom'`인 항목은 규칙에서 빠져도 남긴다.** 통째로 재생성하면 사용자가 연식을 오타로 고쳤다 되돌리는 순간 방문 기록이 날아간다.

---

## 6. 프론트 세션이 내린 판단 중 내가 확인한 것

> 근거는 그쪽 코드 주석에 있다. **판단 주체는 프론트 세션**이므로 바꾸려면 그쪽과 상의할 것.
> 사용자가 요청한 "왜 자동 저장을 안 썼는지 / 왜 방문 기록에만 성공 칩이 없는지"는 프론트 결정이라
> **`docs/HANDOFF-FRONT.md`(프론트 세션이 작성)**에 정식 근거가 있을 것이다.

- **`disabled` 대신 `ref`** (`components/screens/_parts/use-single-flight.ts`)
  React는 상태 변경을 다음 렌더에 반영하므로, 빠르게 두 번 누르면 **버튼이 잠기기 전에 핸들러가 두 번 돈다.** `ref`는 즉시 반영된다. 키를 항목별로 나눠(`bank-${text}`) 서로 다른 체크박스 연속 클릭은 막지 않는다.
- **방문 기록은 항목별 저장이 아니라 `[기록 저장]` 일괄 저장** — 방문 직후 길에서 쓰는 화면이라 항목마다 저장 왕복이 생기면 입력이 끊긴다. 그래서 이탈 경고(`use-unsaved-guard`)가 따로 있다. 저장 **실패** 칩은 있고 성공 칩은 두지 않았다(커밋 `93a9e92` 제목이 그렇게 말한다).
- **붙여넣기 파싱의 3분기** — `!data`(빈 폼) / `dealType`만 없음(**읽은 값 채우고 거래유형만 고르게**) / 전부 읽음(등록). 거래유형은 조사지·안전 점검 항목 선정의 입력값이라 **추측해서 채우지 않는다**(R8).

---

## 7. 검증 방법과 한계 — 가장 중요한 절

### 브라우저가 없다

**Playwright·Puppeteer 미설치.** 그래서 다음은 **검증할 수 없다.**

- 클릭·입력 등 DOM 상호작용
- 카카오 지도 **타일이 실제로 그려지는지**
- `window.print()` **인쇄 미리보기 모양**
- 클라이언트 상태 변화(폼이 채워졌는지, 스피너가 풀렸는지)
- **`useSingleFlight` 같은 클라이언트 가드의 런타임 동작** ← 서버에서 액션을 직접 부르면 가드를 우회하므로 중복이 그대로 생긴다. "중복 방지가 동작한다"고 보고하면 안 된다

이 항목들은 **사용자에게 브라우저 확인을 요청**해야 한다. 대신 코드 판독 + API 응답으로 좁혀서 보고하면 사용자가 확인할 지점이 명확해진다.

### 실제로 쓴 검증 도구 3가지

**(1) 실 DB에 붙는 Server Action 통합 테스트** — 가장 강력하다.

```ts
// tests/_임시.local.test.ts  (검증 후 삭제. *.local.* 는 .gitignore)
import { it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
const SESSION = '고정-uuid';
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'rc_session' ? { name: n, value: SESSION } : undefined), set: () => {} }),
}));
const { createProperty } = await import('@/lib/actions/properties');
it('...', async () => { /* 실제 DB에 쓴다 */ }, 180000);   // ★ 타임아웃 필수
```

```bash
node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/_임시.local.test.ts --testTimeout=300000
```

- **vitest 기본 타임아웃은 5초**다. DB 왕복이 여러 번이면 반드시 늘려라.
- **끝나면 만든 데이터를 지워라.** `DELETE FROM users WHERE id=…` 하면 FK CASCADE로 전부 지워진다.

**(2) 프로덕션 빌드 + HTTP로 렌더된 HTML 검사**

```bash
npx next build && node --env-file=.env.local node_modules/next/dist/bin/next start -p 3000
```

- 포트 3000을 써라 — **카카오 JS 키가 `localhost:3000`에만 등록**돼 있어 다른 포트면 SDK가 거부되고 폴백이 뜬다(코드 문제 아님).
- **`<script>` 태그를 지우고 검사할 것.** 안 지우면 RSC 플라이트 페이로드가 잡혀 "렌더됐다"고 오판한다(§8-③).

**(3) 클라이언트 청크 grep** — `NEXT_PUBLIC_` 주입, 특정 코드 배포 여부 확인에 쓴다.

### 항상 돌려야 하는 것

```bash
npx tsc --noEmit && npx eslint . && npx vitest run
```

`vitest` 114건은 **DB가 없어도 돈다**. `tests/fixtures.test.ts`가 더미 데이터와 순수 함수 결과의 정합성을 지킨다.

---

## 8. 같은 실수를 반복하지 않기 위한 주의사항

내가 실제로 저지른 것들이다.

### ① `git add -A` 쓰지 말 것

사용자가 만든 파일(`docs/recheck-prototype-v4.html`)이 내 커밋에 딸려 들어갔다. **파일을 명시해서 스테이징**하라. `CLAUDE.md`는 사용자가 세션 중 수정하므로 특히 조심.

### ② 검증 스크립트는 히어독 말고 `Write` 도구로

`bash <<'EOF'`로 스크립트를 쓰면 **백슬래시가 소실**되고(정규식 깨짐), **한글이 CP949로 깨진다**. `curl -d '{"address":"한글"}'`도 Git Bash에서 인코딩이 깨져 "주소를 못 찾음"으로 나온다 — 실제로 `/api/geocode`가 고장 난 줄 알고 30분 헤맸다.

→ **`Write` 도구로 `*.local.mts` 파일을 만들고 `node`로 실행.** 한글 JSON은 `JSON.stringify`가 알아서 처리한다.

### ③ "렌더된 마크업"과 "RSC 페이로드"를 구분할 것

`grep addressDetail`로 11건이 나와 R7 위반이라 보고했는데, **10건은 `<script>` 안 직렬화 데이터**였고 실제 렌더는 1건(편집 입력란, 정상)이었다. 반대로 `addressDetail` **키 이름**만 보고 "값이 남아 있다"고 오판한 적도 있다 — **값을 봐야 한다**.

### ④ 파일이 여러 개인 것을 하나만 보고 결론 내지 말 것

"인쇄 CSS가 없다"고 보고했는데 **CSS 링크가 2개**였고 두 번째 파일에 `@media print`가 멀쩡히 있었다.

### ⑤ 화면 숫자는 포맷된다

`grep "4000"`으로 "비교 화면에 예상대출이 없다"고 보고했는데 화면은 **`4,000만`**으로 렌더한다. 쉼표·단위·`—`(빈 값) 표기를 감안하라.

### ⑥ ASCII 와이어프레임은 표시 폭을 계산해서 고칠 것

`docs/PRD.md` §7의 박스는 한글이 2칸이다. 문자열만 바꾸면 폭이 깨진다. **East Asian Width로 계산해 원본 폭 분포와 맞춰라**(§7.1은 `{65:15, 66:4}` — 원본에 이미 66이 4줄 있다. 전부 65로 만들려 하지 말 것).

### ⑦ 폴링 감지 문자열은 "그 상태에서 실제로 나오는 것"으로

배포 반영을 `"대구대학교"`로 감지하려다 10분을 날렸다. **DB를 비워 홈이 빈 상태였고 거리 문구가 렌더되지 않았다.**

### ⑧ 포트 3000은 VS Code가 잡을 수 있다

`Code.exe`가 3000에 바인딩해 정적 디렉터리 리스팅(`<title>Index of /</title>`)을 서빙한 적이 있다. **띄우기 전에 `netstat -ano | grep ":3000 "`로 확인**하고, 남의 프로세스면 죽이지 말고 사용자에게 알려라. 브라우저 캐시로 옛 화면이 남는 경우도 있다(강력 새로고침·시크릿 창으로 판별).

### ⑨ 상수를 바꾸면 파생값도 바꿔야 한다

`SCHOOL_ORIGIN` 교체 후 `fixtures/properties.json`의 `distanceFromSchool`이 옛 값으로 남아 자기모순이 됐다. `tests/fixtures.test.ts`가 이제 이걸 잡는다. **더미 데이터의 숫자를 손으로 쓰지 말고 실제 함수를 태워 생성하라.**

### ⑩ 스스로 검증하고 나서 보고할 것

"완료했습니다"는 `tsc`·`eslint`·`vitest`·`build` **결과를 붙여서만** 말한다(CLAUDE.md 작업 방식 4번). 판정이 애매하면 "확인하지 못했다"고 명시하라 — 지도 타일·인쇄 미리보기가 그렇다.

---

## 9. 다음 세션이 처음 읽어야 할 파일

### 반드시 (순서대로)

| 파일 | 왜 |
|---|---|
| `CLAUDE.md` | 불변 규칙 R1~R8. 여기서 벗어나면 전부 무효 |
| `docs/HANDOFF-BACK.md` | 이 문서 |
| `docs/INFRA.md` | 외부 서비스 상태 · **의사결정 로그** · 트러블슈팅 · D4 체크리스트 |

### 코드를 만지기 전에

| 파일 | 왜 |
|---|---|
| `lib/types.ts` | **API 계약 DTO.** 프론트가 이 타입을 import 한다 |
| `lib/actions/_shared.ts` | 소유권 검증 · 상태 전이 · 입력 정규화 공통 규약 |
| `lib/actions/properties.ts` | 액션 작성 패턴의 기준. `checkLimits()`·`syncVisitChecks()` |
| `lib/rules.ts` | 규칙 상수 5종. **모든 항목 선정의 단일 소스** |
| `lib/geo.ts` · `lib/finance.ts` | 순수 계산. 확정 파일 |
| `proxy.ts` + `lib/session.ts` | 세션이 어떻게 발급·보장되는지 |

### 화면과 붙일 때

| 파일 | 왜 |
|---|---|
| `components/screens/README.md` | 프론트 전달용 규약(출처 배지·거리 문구·전환 계산기) |
| `components/map/README.md` | `PropertyMapPanel` 시그니처와 `toMapProperties()` 사용 이유 |
| `app/page.tsx` · `app/property/new/add-client.tsx` | **서버 페이지 ↔ 클라이언트 경계 패턴.** 일반 함수는 서버→클라이언트로 못 넘긴다 |
| `app/_lib/nav.ts` · `api-client.ts` · `property.ts` | `hrefFor` · Route Handler 래퍼 · `addressDetail` 제거 |

### 테스트를 고칠 때

`tests/fixtures.test.ts`(더미 정합성) · `tests/geo.test.ts`(기준점 고정) · `tests/ai-guardrails.test.ts`(R1 방어선·모델 고정)

---

## 10. 한 줄 요약

**규칙이 판정하고, AI는 3지점에서 자유 텍스트만 다루고, 판단은 사용자가 한다.**
외부 의존성은 전부 폴백이 있고, 실패는 예외가 아니라 `{ok:false}`다.
확신이 없으면 실측하고, 실측할 수 없으면 "확인하지 못했다"고 쓴다.
