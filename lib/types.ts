import type {
  DealType,
  Heating,
  PropertyStatus,
  VisitResult,
  QuestionSource,
  CheckMap,
  DocumentKind,
  OcrSource,
  FieldBbox,
  DiscrepancyStatus,
} from '@/db/schema';

/**
 * 프론트↔백 API 계약 (PRD v2.1 §8.4) — D1에 동결. 이후 필드명 변경 금지.
 *
 * DB row를 그대로 내보내지 않고 DTO로 변환하는 이유:
 *   · area가 numeric 컬럼이라 드라이버에서 string으로 오므로 number로 정규화
 *   · createdAt/updatedAt(Date)은 직렬화 경계를 넘기므로 ISO 문자열로 고정
 *   · progress는 DB 컬럼이 아니라 계산값(lib/geo.calcProgress)
 */

export type VisitCheckDTO = {
  id: string;
  propertyId: string;
  ruleId: string;
  category: string;
  title: string;
  description: string;
  result: VisitResult;
  memo: string;
  sort: number;
};

export type QuestionDTO = {
  id: string;
  propertyId: string;
  text: string;
  source: QuestionSource;
  answer: string;
  noAnswer: boolean;
  sort: number;
};

export type PropertyDTO = {
  id: string;
  name: string;

  address: string;
  /** ★ R7: 저장은 하되 지도 핀·PDF·공유 화면에 렌더링하지 않는다 */
  addressDetail: string;
  latitude: number | null;
  longitude: number | null;
  /** 대구대학교 기준 직선거리(m). 좌표가 없으면 null → "위치 미지정" */
  distanceFromSchool: number | null;

  dealType: DealType;
  price: number;
  deposit: number;
  mgmtFee: number;

  /**
   * 사글세 전용 (2026-08-12 추가). 그 외 거래유형에서는 항상 null이다.
   *
   * ★ `number | null`이지 `number`가 아니다. **0과 null은 다르다** —
   *   0은 "선납 없음", null은 "아직 입력하지 않음"이다.
   *   null을 0으로 접어 표시하면 서비스가 "월 0원"이라는 숫자를 만들어낸 것이 된다 (R8).
   * ★ 값이 있어도 다른 거래유형과 같은 기준으로 환산하지 않는다 — §사글세 참조.
   */
  prepaidMonths: number | null;
  prepaidTotal: number | null;

  area: number;
  age: number;
  heating: Heating;
  floor: string;
  link: string;

  status: PropertyStatus;
  noConcern: boolean;
  /** 규칙 기반 집계 (점수화 아님) */
  progress: number;

  visitChecks: VisitCheckDTO[];
  questions: QuestionDTO[];

  safetyChecks: CheckMap;
  contractChecks: CheckMap;
  afterChecks: CheckMap;

  createdAt: string;
  updatedAt: string;
};

/** Server Action 공통 반환형 — 프론트가 try/catch 없이 분기할 수 있게 한다 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/* ── v2 문서 (docs/API-V2.md §3) ─────────────────────────────── */

/** 확인 화면 [저장] 때 보내는 필드 한 칸. 원문·이미지는 보내지 않는다 (R9) */
export type DocumentFieldInput = {
  fieldKey: string;
  /** ★ R8: 못 찾았거나 비워 두면 null. 빈 문자열로 저장하지 않는다 */
  value: string | null;
  /** 페이지 대비 비율 좌표(0~1, 왼쪽 위 원점). 없으면 null → 화면은 "위치 추정" */
  bbox: FieldBbox | null;
  confidence: number | null;
  /** 확인 화면에서 사용자가 값을 바꿨는가 */
  editedByUser: boolean;
};

/** 대조 결과 한 행 (docs/API-V2.md §4). status는 lib/compare 순수 함수만 정한다 */
export type DiscrepancyDTO = {
  id: string;
  fieldKey: string;
  docA: DocumentKind;
  /** 같은 문서 안 비교(deposit_text_kr ↔ deposit)면 docA와 같다 */
  docB: DocumentKind;
  /** 원문 표기 그대로 */
  valueA: string | null;
  valueB: string | null;
  status: DiscrepancyStatus;
};

/** 조사지 "문서에서 확인된 차이"용 — 값(성명·금액)을 뺀 대조 행. 조사지는 인쇄된다 */
export type DocumentDiffRow = Omit<DiscrepancyDTO, 'valueA' | 'valueB'>;

/** 매물의 문서 한 건 + 필드. 원본은 없다 — 원본은 기기(IndexedDB)에만 있다 */
export type DocumentDTO = {
  id: string;
  kind: DocumentKind;
  ocrSource: OcrSource;
  createdAt: string;
  fields: (DocumentFieldInput & { id: string })[];
};
