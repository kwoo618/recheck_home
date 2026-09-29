# API-V2.md — v2 라우트·Server Action 계약

> **이 문서의 용도**: v2에서 새로 생기거나 바뀌는 서버 경계(API 라우트 · Server Action)의 요청·응답 계약.
> 3단계(PDF 추출·구조화)와 4단계(대조)는 이 계약을 따른다. 사양(무엇을 하나)은 `V2-PLAN.md` §4, 제약(한도·실측)은 `V2-TECH-REVIEW.md` §5.
> **최초 작성 2026-09-29 (야간 S2). 이후 계약 변경은 승인 필요** (`CLAUDE.md` 승인 필요 목록).
> 아래 타입 이름 중 `db/schema.ts`에 있는 것(`DocumentKind` · `OcrSource` · `DiscrepancyStatus` · `FieldBbox` · `MgmtFeeMode`)은 그 파일이 단일 소스다. 이 문서는 형태만 옮겨 적는다.

---

## 0. 공통 규약 (v1과 같다)

| 항목 | 규약 |
|---|---|
| API 라우트 실패 | **항상 HTTP 200** + `{ ok: false, reason: string }`. `throw`로 500을 내지 않는다 (R4). `reason`은 화면에 그대로 보여도 되는 한국어 문장 |
| Server Action 쓰기 | `ActionResult<T>` = `{ ok: true, data: T } \| { ok: false, error: string }` (`lib/types.ts`). 예외를 던지지 않는다 |
| Server Action 읽기 | 값을 그대로 돌려준다(`listProperties()`와 같은 방식). 실패는 에러 바운더리로 간다 |
| 세션 | 모든 라우트·액션은 세션을 먼저 확인한다. 세션 없는 API 호출은 폴백 없이 `{ok:false}` |
| 소유권 | 매물 id를 받는 곳은 `findOwnedProperty()`로 확인한다. 남의 매물은 **없는 것**으로 취급 → `NOT_FOUND`(`'매물을 찾을 수 없습니다.'`) |
| AI 기록 | AI를 부르는 라우트는 `logAi(touchpointId, …)`로 기록한다. id는 `lib/ai/touchpoints.ts`에 **active**로 등록된 것만 (`tests/ai-guardrails.test.ts`가 강제) |

### 0-1. 본문 한도 [문서 확인 — V2-TECH-REVIEW §5]

| 경계 | 상한 | 넘으면 | 이 계약의 대응 |
|---|---|---|---|
| API 라우트(Vercel 함수) 요청·응답 본문 | **4.5MB** | 플랫폼이 `413 FUNCTION_PAYLOAD_TOO_LARGE`를 돌려준다 — **라우트 코드가 실행되지 않으므로 200 + `{ok:false}`를 서버가 만들 수 없다** | 클라이언트가 전송 전에 크기를 확인하고, 응답이 413이면 `{ok:false}`와 같은 폴백(수기 입력)으로 처리한다. `lib/client/*`의 fetch 래퍼 한 곳에서 한다 |
| Server Action 요청 본문 | **기본 1MB** (`serverActions.bodySizeLimit`) | 요청 실패 | 문서 원문·이미지를 Server Action으로 보내지 않는다(R9). 추출 필드만 보낸다. 오프라인 큐는 **항목 단위로 순차 전송**, 묶지 않는다. 상한을 올려야 하면 `next.config.ts`에 이유 주석 |
| 함수 실행 시간 | 미확인 (V2-TECH-REVIEW §5-3) | 타임아웃 | Gemini 호출은 `GEMINI_TIMEOUT_MS`로 먼저 끊고 `{ok:false}`. 라우트 수준 `maxDuration`은 3단계에서 실측 후 정한다 |

> 텍스트 입력의 글자 수 상한(v1 `/api/ai/parse`의 `MAX_INPUT_LENGTH` 같은 값)은 **3단계에서 실제 문서 텍스트 길이를 실측한 뒤** 정해 이 문서에 적는다. 실측 전에는 숫자를 적지 않는다 (R8).

---

## 1. 공통 스키마 필드 키 (`document_fields.field_key`)

V2-PLAN §4-1 공통 스키마 표가 기준이다. 키는 아래 문자열만 쓴다.

| 키 | 광고 `ad` | 등기부 `registry` | 계약서 `contract` | 대조 |
|---|---|---|---|---|
| `address_road` · `address_jibun` | ○ | ○ | ○ | `same` / `needs_review`만 (**R10 — `different` 없음**) |
| `building_name` | ○ | ○ | △ | 〃 (주소 계열) |
| `address_detail` | △ | ○ | ○ | **대조·렌더링 안 함** — 저장만 (R7) |
| `use` · `structure` | △ · — | ○ · ○ | — | `use`만 |
| `area_exclusive` · `floor` | ○ | ○ | ○ | ○ |
| `owner_name` | — | ○ | — | `lessor_name`·`account_holder`와 |
| `lessor_name` · `account_holder` | — | — | ○ | `owner_name`과 |
| `deposit` · `rent` · `maintenance_fee` | ○ | — | ○ | ○ |
| `deposit_text_kr` | — | — | ○ | 같은 문서 `deposit`과 (`doc_a = doc_b = 'contract'`) |
| `lease_start` · `lease_end` | △ | — | ○ | ○ |
| `down_payment` · `balance` · `balance_date` · `rent_due_day` · `rent_method` · `agent_flag` | — | — | ○ | 대조 안 함 — 계약서 확인 항목(§4-6) 입력 |
| `lien_total` · `seizure_flags` | — | ○ | — | 대조 안 함 — 단독 표시 |
| `special_terms` | — | — | ○ | **대조 안 함.** 원문 표시만. 인쇄·공유 제외 (R7) |

**값 표기 규약**
- `value`는 **문서에 적힌 표기 그대로의 문자열**이다. 지점 ④는 옮겨 적기만 하고 단위 환산·정규화(㎡↔평, 만원↔원, 날짜 형식)를 하지 않는다. 정규화는 `lib/compare/*` 순수 함수가 한다 (R2).
- 못 찾으면 `null`. 빈 문자열·추정값으로 채우지 않는다 (R8).
- `agent_flag`는 `'true'` / `'false'` / `null`. `seizure_flags`는 문서에 보이는 항목명을 `,`로 이은 문자열 또는 `null`.

---

## 2. 지점 ④ 문서 구조화 — `POST /api/ai/document` (3단계 신규)

`TOUCHPOINTS.document_structure` — 3단계에서 `status: 'active'`로 바꾸고 `ACTIVE_PROMPTS`(테스트)에 프롬프트를 등록한다.

```ts
// 요청
type DocumentStructureRequest = {
  propertyId: string;
  kind: DocumentKind;        // 'ad' | 'registry' | 'contract' — 종류별로 프롬프트가 다르다 (R3)
  text: string;              // pdf.js 텍스트 레이어 추출 결과. 클라이언트에서 주민번호·생년월일 마스킹 후
};

// 응답 — 항상 HTTP 200
type DocumentStructureResponse =
  | { ok: true; fields: ExtractedField[] }
  | { ok: false; reason: string };

type ExtractedField = {
  fieldKey: string;          // §1 키 중 해당 kind에 ○·△인 것만
  value: string | null;      // 원문 표기 그대로. 못 찾으면 null
  confidence: number | null; // 모델이 주지 않으면 null. 0~1로 지어내지 않는다
};
```

| 항목 | 규약 |
|---|---|
| 마스킹 | 클라이언트가 전송 전에 마스킹한다. **서버도 모델 호출 전에 같은 마스킹을 한 번 더** 적용한다(이중 장치). 마스킹 함수는 순수 함수 하나로 두고 양쪽이 import |
| bbox | 서버는 bbox를 모른다. 클라이언트가 pdf.js 텍스트 항목의 transform과 응답 `value`를 맞춰 계산한다. 못 맞추면 `null` → 화면 "위치 추정" |
| 원문 저장 | 이 라우트는 `text`를 DB에 저장하지 않는다 (R9) |
| `ai_logs` | `inputSummary`에 **원문을 넣지 않는다.** `kind`와 글자 수만 (`registry · 3120자`). `outputText`는 필드 JSON이지만 성명이 들어 있으므로 3단계에서 성명 키 값을 가린 뒤 기록한다 |
| 판정 금지 | 프롬프트에 `NO_JUDGMENT_RULE` 포함 + 출력 `containsBanned()` 통과. 걸리면 `{ok:false}` |
| 폴백 | `{ok:false}` → 확인 화면의 모든 칸이 빈 상태로 열린다(수기 입력). 흐름이 끊기지 않는다 |
| 결과 저장 | 이 라우트는 저장하지 않는다. 사용자가 **확인 화면에서 전 필드를 검토·수정한 뒤** `saveDocument`로 저장한다 |

---

## 3. 문서 Server Action — `lib/actions/documents.ts` (3단계 신규)

```ts
type DocumentFieldInput = {
  fieldKey: string;
  value: string | null;
  bbox: FieldBbox | null;    // { page, x, y, w, h } — page는 1부터
  confidence: number | null;
  editedByUser: boolean;     // 확인 화면에서 사용자가 값을 바꿨는가
};

/** 확인 화면 [저장]. 같은 매물·같은 kind의 기존 문서가 있으면 교체한다 (매물당 kind별 1건) */
saveDocument(input: {
  propertyId: string;
  kind: DocumentKind;
  ocrSource: OcrSource;      // OCR 보류 중에는 'pdf_text' | 'manual'만
  fields: DocumentFieldInput[];
}): Promise<ActionResult<{ documentId: string }>>;

/** 매물의 문서 목록 + 필드. 원본은 없다 — 원본은 IndexedDB에서 클라이언트가 찾는다 */
listDocuments(propertyId: string): Promise<DocumentDTO[]>;

/** 서버 쪽 추출 필드만 지운다. IndexedDB 원본 삭제는 클라이언트 몫 */
deleteDocument(documentId: string): Promise<ActionResult<void>>;

type DocumentDTO = {
  id: string;
  kind: DocumentKind;
  ocrSource: OcrSource;
  createdAt: string;         // ISO
  fields: (DocumentFieldInput & { id: string })[];
};
```

- 요청 본문에 원문·이미지·파일 경로를 넣지 않는다. `documents`에는 원본 참조 컬럼이 없다 (R9).
- Neon HTTP 드라이버는 트랜잭션이 없다(`db/index.ts`). 교체는 **새 문서·필드 삽입 → 성공 시 옛 문서 삭제** 순서로 해서, 중간 실패 시 옛 값이 남게 한다.
- 문서 준비 상태 패널(V2-PLAN §4-3)은 `listDocuments` 결과의 `kind` 집합으로 그린다. 별도 액션을 두지 않는다.

---

## 4. 대조 Server Action — `lib/actions/compare.ts` (4단계 신규)

```ts
/** 대조 실행. 멱등 — property_id 기준 전량 삭제 후 재삽입 (V2-PLAN §8) */
runCompare(propertyId: string): Promise<ActionResult<{ discrepancies: DiscrepancyDTO[] }>>;

/** 마지막 대조 결과. 대조한 적 없으면 [] */
listDiscrepancies(propertyId: string): Promise<DiscrepancyDTO[]>;

type DiscrepancyDTO = {
  id: string;
  fieldKey: string;
  docA: DocumentKind;
  docB: DocumentKind;        // 같은 문서 안 비교(deposit_text_kr ↔ deposit)면 docA와 같다
  valueA: string | null;     // 원문 표기 그대로 — 화면은 두 값을 나란히 보여준다
  valueB: string | null;
  status: DiscrepancyStatus; // 'same' | 'different' | 'missing_not_applicable' | 'missing_not_found' | 'needs_review'
};
```

| 항목 | 규약 |
|---|---|
| 판정 위치 | `status`는 `lib/compare/*` 순수 함수만 정한다. 이 액션은 DB에서 필드를 읽어 넘기고 결과를 저장만 한다 (R2) |
| 선행 조건 | 문서 `kind`가 2종 미만이면 `{ ok: false, error }` — 문구는 준비 상태 패널과 같게 |
| R10 | 주소 계열 키(`address_road` · `address_jibun` · `building_name`)는 `same` 또는 `needs_review`만. `different`를 돌려주면 `lib/compare` 테스트가 실패해야 한다 |
| R7 | `address_detail` · `special_terms`는 `discrepancies`에 행을 만들지 않는다 |
| 재실행 실패 | 트랜잭션이 없으므로 삭제 후 삽입이 실패하면 결과가 빈다. `{ok:false}`를 돌려주고, 재실행하면 복구된다(멱등) |
| 심각도·순위 | 없다. 정렬은 §1 표 순서(키 순)로 고정 |

---

## 5. 기존 라우트·액션 확장

### 5-1. `POST /api/ai/questions` — 문서 불일치 → 질문 (4단계, 지점 ② 확장)

```ts
// 기존 v1 요청은 그대로 유지
type QuestionsRequest =
  | { concern: string }                 // v1
  | { discrepancyId: string };          // v2 추가 — 둘 중 하나만

// 응답은 v1과 같다
type QuestionsResponse = {
  ok: boolean;
  questions: string[];                  // 실패해도 비어 있지 않다 (템플릿 폴백)
  source: 'ai' | 'template';
  reason?: string;
};
```

- 서버가 `discrepancyId`로 행을 읽고 소유권(매물 → 세션)을 확인한다. 남의 것이면 `{ ok:false, questions: [], reason: NOT_FOUND }`.
- **모델에는 값(`valueA`·`valueB`)을 보내지 않는다.** 필드 이름과 두 문서 종류만 보낸다 — 성명·금액이 외부로 나갈 이유가 없다. 질문은 "어느 쪽이 맞는지 확인"이 목적이라 값이 필요 없다.
- 폴백 템플릿: `"{field}가 {docA}와 {docB}에서 다릅니다. 어느 쪽이 맞는지 확인해 주세요."` (V2-PLAN §4-2). 템플릿은 `lib/rules.ts`에 둔다.
- `status`가 `different` · `needs_review` · `missing_not_found`인 행만 받는다. `same` · `missing_not_applicable`이면 `{ok:false}` + 빈 질문.

### 5-2. 관리비 부과 방식 — `properties.mgmt_fee_mode` (V2-PLAN §6)

| 경계 | 변경 |
|---|---|
| `createProperty` · `updateProperty` 입력 | `mgmtFeeMode?: MgmtFeeMode \| null` 추가. 허용값 `'포함' \| '매월 별도' \| '모름'`, 그 밖의 값은 `null`로 저장 |
| `PropertyDTO` | `mgmtFeeMode: MgmtFeeMode \| null`. `null` = 아직 묻지 않음, `'모름'` = 사용자가 모른다고 답함 — 둘은 다르다 |
| `POST /api/ai/parse` 응답 `data` | `mgmtFeeMode?` 추가 (지점 ① 확장). 텍스트에 없으면 키 생략 |

### 5-3. `ai_logs.touchpoint`

- `logAi(touchpoint: TouchpointId, …)` — 첫 인자가 v1 `feature`에서 지점 id로 바뀌었다(S2). `feature`는 등록표에서 따라온다.
- 마이그레이션 `0002` 미적용 DB에서는 `touchpoint` 없이 v1 형태로 한 번 더 기록하고, 그것도 실패하면 삼킨다. **본 요청은 로그와 무관하게 진행한다.**
- ⚠ 단, `properties`에 컬럼이 추가됐으므로 **마이그레이션 미적용 DB에 v2 코드를 배포하면 매물 조회·저장 자체가 실패한다.** 배포 전 `db:migrate`가 선행 조건이다.
