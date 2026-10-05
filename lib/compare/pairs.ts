import type { DocumentKind } from '@/db/schema';
import type { DocumentFieldKey } from '@/lib/documents/fields';

/**
 * 무엇과 무엇을 대조하나 — V2-PLAN §4-1 "대표 대조 항목" · API-V2 §1 "대조" 열
 *
 * ★ 순수 상수. 순서가 곧 결과 정렬 순서다(API-V2 §4 "§1 표 순서로 고정"). 심각도·순위가 아니다 (R1).
 * ★ address_detail · special_terms 는 여기 없다 — discrepancies에 행을 만들지 않는다 (R7).
 * ★ lien_total · seizure_flags 는 비교하지 않는다. 등기부 단독 표시 항목(STANDALONE_KEYS)이다.
 * ★ 다른 키끼리 비교하는 쌍(소유자 ↔ 임대인 · 예금주 ↔ 소유자 · 한글 금액 ↔ 숫자 금액)은
 *   discrepancies.field_key 에 **B 쪽이 아닌 쌍 고유 키**를 쓴다: lessor_name · account_holder · deposit_text_kr.
 *   화면·질문은 (fieldKey, docA, docB)로 이 표에서 쌍을 다시 찾는다.
 */

/**
 * 비교 방식.
 *   address — same / needs_review 만 (R10 — 표기 체계가 달라 다른 것이다)
 *   name · amount · area · use · floor · date — different 를 낼 수 있다 (R10 허용 필드)
 */
export type CompareType = 'address' | 'name' | 'amount' | 'area' | 'use' | 'floor' | 'date';

export type ComparePair = {
  /** discrepancies.field_key */
  fieldKey: DocumentFieldKey;
  /** 결과 제목 */
  label: string;
  /** 질문 문장 속 항목 이름 ("{field}가 …에서 다릅니다"). 없으면 label */
  questionField?: string;
  type: CompareType;
  a: { kind: DocumentKind; key: DocumentFieldKey; label?: string };
  b: { kind: DocumentKind; key: DocumentFieldKey; label?: string };
};

function same(
  fieldKey: DocumentFieldKey,
  label: string,
  type: CompareType,
  a: DocumentKind,
  b: DocumentKind,
): ComparePair {
  return { fieldKey, label, type, a: { kind: a, key: fieldKey }, b: { kind: b, key: fieldKey } };
}

/** 세 문서 두 개씩 — 등기부를 앞에 둔다 */
function allPairs(fieldKey: DocumentFieldKey, label: string, type: CompareType): ComparePair[] {
  return [
    same(fieldKey, label, type, 'registry', 'ad'),
    same(fieldKey, label, type, 'registry', 'contract'),
    same(fieldKey, label, type, 'ad', 'contract'),
  ];
}

export const COMPARE_PAIRS: readonly ComparePair[] = [
  ...allPairs('address_road', '도로명 주소', 'address'),
  ...allPairs('address_jibun', '지번 주소', 'address'),
  ...allPairs('building_name', '건물 이름', 'address'),
  same('use', '건물 용도', 'use', 'ad', 'registry'),
  // 면적·층: 광고 ↔ 등기부 / 광고 ↔ 계약서 / 목적물 표시(계약서) ↔ 표제부(등기부)
  ...allPairs('area_exclusive', '전용면적', 'area'),
  ...allPairs('floor', '층', 'floor'),
  {
    fieldKey: 'lessor_name',
    label: '소유자 ↔ 임대인',
    questionField: '소유자·임대인 성명',
    type: 'name',
    a: { kind: 'registry', key: 'owner_name', label: '소유자란' },
    b: { kind: 'contract', key: 'lessor_name', label: '임대인란' },
  },
  {
    fieldKey: 'account_holder',
    label: '계약금 입금 계좌 예금주 ↔ 소유자',
    questionField: '예금주·소유자 성명',
    type: 'name',
    a: { kind: 'contract', key: 'account_holder', label: '계약금 입금 계좌 예금주란' },
    b: { kind: 'registry', key: 'owner_name', label: '소유자란' },
  },
  same('deposit', '보증금', 'amount', 'ad', 'contract'),
  same('rent', '월세', 'amount', 'ad', 'contract'),
  same('maintenance_fee', '관리비', 'amount', 'ad', 'contract'),
  {
    // 같은 문서 안 두 표기. 어느 쪽이 우선인지는 말하지 않는다 (V2-STATUS §6)
    fieldKey: 'deposit_text_kr',
    label: '보증금 한글 표기 ↔ 숫자 표기',
    questionField: '보증금',
    type: 'amount',
    a: { kind: 'contract', key: 'deposit_text_kr', label: '한글 표기' },
    b: { kind: 'contract', key: 'deposit', label: '숫자 표기' },
  },
  same('lease_start', '임대차 시작일', 'date', 'ad', 'contract'),
  same('lease_end', '임대차 종료일', 'date', 'ad', 'contract'),
];

/** 결과 행 → 쌍 정의. 없으면 null (옛 결과·알 수 없는 키) */
export function findPair(
  fieldKey: string,
  docA: DocumentKind,
  docB: DocumentKind,
): ComparePair | null {
  return (
    COMPARE_PAIRS.find((p) => p.fieldKey === fieldKey && p.a.kind === docA && p.b.kind === docB) ?? null
  );
}

/** 비교하지 않고 등기부에서 그대로 보여 주는 항목 (API-V2 §1 "단독 표시") */
export const STANDALONE_KEYS: readonly DocumentFieldKey[] = ['lien_total', 'seizure_flags'];
