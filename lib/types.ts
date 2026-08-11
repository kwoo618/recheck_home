import type {
  DealType,
  Heating,
  PropertyStatus,
  VisitResult,
  QuestionSource,
  CheckMap,
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
  /** 대구대 정문 기준 직선거리(m). 좌표가 없으면 null → "위치 미지정" */
  distanceFromSchool: number | null;

  dealType: DealType;
  price: number;
  deposit: number;
  mgmtFee: number;
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
