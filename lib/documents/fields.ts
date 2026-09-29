import type { DocumentKind } from '@/db/schema';

/**
 * 문서 공통 스키마 필드 (V2-PLAN §4-1 · docs/API-V2.md §1)
 *
 * document_fields.field_key 에는 여기 있는 키만 들어간다.
 * 종류(kind)별로 "그 문서에 있을 수 있는 키"(○·△)만 허용한다 — 광고에 소유자, 등기부에 월세 같은
 * 키는 받지 않는다. 대조 쪽(lib/compare)은 이 목록에 없는 칸을 missing_not_applicable 로 본다.
 *
 * ★ 순수 상수 모듈. 서버(라우트·액션)와 클라이언트(확인 화면)가 같이 읽는다.
 */

export type DocumentFieldKey =
  | 'address_road'
  | 'address_jibun'
  | 'building_name'
  | 'address_detail'
  | 'use'
  | 'structure'
  | 'area_exclusive'
  | 'floor'
  | 'owner_name'
  | 'lessor_name'
  | 'account_holder'
  | 'deposit'
  | 'rent'
  | 'maintenance_fee'
  | 'deposit_text_kr'
  | 'lease_start'
  | 'lease_end'
  | 'down_payment'
  | 'balance'
  | 'balance_date'
  | 'rent_due_day'
  | 'rent_method'
  | 'agent_flag'
  | 'lien_total'
  | 'seizure_flags'
  | 'special_terms';

export type FieldSpec = {
  key: DocumentFieldKey;
  /** 확인 화면 라벨 */
  label: string;
  /** 이 키가 있을 수 있는 문서 (V2-PLAN §4-1 표의 ○·△) */
  kinds: readonly DocumentKind[];
  /** 여러 줄 입력 */
  multiline?: boolean;
  /** 확인 화면에 붙는 짧은 설명 */
  note?: string;
};

/** API-V2 §1 표 순서 그대로. 확인 화면·대조 결과 정렬도 이 순서를 쓴다 */
export const FIELD_SPECS: readonly FieldSpec[] = [
  { key: 'address_road', label: '도로명 주소', kinds: ['ad', 'registry', 'contract'] },
  { key: 'address_jibun', label: '지번 주소', kinds: ['ad', 'registry', 'contract'] },
  { key: 'building_name', label: '건물 이름', kinds: ['ad', 'registry', 'contract'] },
  {
    key: 'address_detail',
    label: '상세주소 (동·호수)',
    kinds: ['ad', 'registry', 'contract'],
    note: '저장만 합니다. 대조 결과·인쇄에는 나오지 않습니다.',
  },
  { key: 'use', label: '건물 용도', kinds: ['ad', 'registry'] },
  { key: 'structure', label: '구조', kinds: ['registry'] },
  { key: 'area_exclusive', label: '전용면적', kinds: ['ad', 'registry', 'contract'] },
  { key: 'floor', label: '층', kinds: ['ad', 'registry', 'contract'] },
  { key: 'owner_name', label: '소유자', kinds: ['registry'] },
  { key: 'lessor_name', label: '임대인', kinds: ['contract'] },
  { key: 'account_holder', label: '계약금 입금 계좌 예금주', kinds: ['contract'] },
  { key: 'deposit', label: '보증금', kinds: ['ad', 'contract'] },
  { key: 'rent', label: '월세', kinds: ['ad', 'contract'] },
  { key: 'maintenance_fee', label: '관리비', kinds: ['ad', 'contract'] },
  { key: 'deposit_text_kr', label: '보증금 한글 표기', kinds: ['contract'] },
  { key: 'lease_start', label: '임대차 시작일', kinds: ['ad', 'contract'] },
  { key: 'lease_end', label: '임대차 종료일', kinds: ['ad', 'contract'] },
  { key: 'down_payment', label: '계약금', kinds: ['contract'] },
  { key: 'balance', label: '잔금', kinds: ['contract'] },
  { key: 'balance_date', label: '잔금일', kinds: ['contract'] },
  { key: 'rent_due_day', label: '월세 지급일', kinds: ['contract'] },
  { key: 'rent_method', label: '월세 지급 방법', kinds: ['contract'] },
  {
    key: 'agent_flag',
    label: '대리인 계약 여부',
    kinds: ['contract'],
    note: 'true / false 로 적습니다. 모르면 비워 둡니다.',
  },
  {
    key: 'lien_total',
    label: '을구 채권최고액',
    kinds: ['registry'],
    note: '문서에 보이는 표기를 그대로 적습니다. 말소된 항목이 섞여 있을 수 있으니 원본에서 확인하세요.',
  },
  {
    key: 'seizure_flags',
    label: '가압류·가처분·신탁 표기',
    kinds: ['registry'],
    note: '문서에 보이는 항목명을 쉼표로 적습니다. 말소된 항목이 섞여 있을 수 있으니 원본에서 확인하세요.',
  },
  {
    key: 'special_terms',
    label: '특약 원문',
    kinds: ['contract'],
    multiline: true,
    note: '대조하지 않고 원문만 보여 줍니다. 인쇄·공유에는 나오지 않습니다.',
  },
];

export const FIELD_KEYS: readonly DocumentFieldKey[] = FIELD_SPECS.map((s) => s.key);

export const DOCUMENT_KINDS: readonly DocumentKind[] = ['registry', 'ad', 'contract'];

/** 화면 표기. 준비 상태 패널 순서(등기부 · 광고 · 계약서)는 DOCUMENT_KINDS 순서 */
export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  ad: '광고',
  registry: '등기부',
  contract: '계약서',
};

/**
 * R7 — 인쇄·공유 경로에 넣지 않는 키.
 * address_detail 은 호수, special_terms 원문에는 성명·호수가 들어 있다.
 */
export const PRIVATE_FIELD_KEYS: readonly DocumentFieldKey[] = ['address_detail', 'special_terms'];

/** ai_logs 에 값을 남기지 않는 키 — 성명·호수·특약 원문 */
export const LOG_REDACTED_KEYS: readonly DocumentFieldKey[] = [
  'owner_name',
  'lessor_name',
  'account_holder',
  'address_detail',
  'special_terms',
];

export function isDocumentKind(v: unknown): v is DocumentKind {
  return v === 'ad' || v === 'registry' || v === 'contract';
}

export function fieldSpecsFor(kind: DocumentKind): FieldSpec[] {
  return FIELD_SPECS.filter((s) => s.kinds.includes(kind));
}

export function isFieldKeyFor(kind: DocumentKind, key: unknown): key is DocumentFieldKey {
  return typeof key === 'string' && FIELD_SPECS.some((s) => s.key === key && s.kinds.includes(kind));
}
