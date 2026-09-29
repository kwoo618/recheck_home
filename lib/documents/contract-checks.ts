import {
  CONTRACT_CHECK_RULES,
  matchSpecialTerms,
  SPECIAL_TERMS_KEYWORDS,
  type SpecialTermsGroup,
  type SpecialTermsMatch,
} from '@/lib/rules';
import type { DiscrepancyDTO, DocumentDTO } from '@/lib/types';
import type { DocumentFieldKey } from './fields';

/**
 * 계약서 확인 항목(V2-PLAN §4-6)의 자동 채움 자료 — 순수 함수
 *
 * 서버(안전 점검 page)가 저장된 문서·대조 결과에서 **항목이 참조하는 것만** 골라 화면에 넘긴다.
 *
 * ★ R7: 특약 원문(special_terms)은 넘기지 않는다. 서버에서 키워드 매칭 결과만 만든다.
 *   상세주소(address_detail)도 넘기지 않는다.
 * ★ 문서·대조 결과가 없으면 빈 자료다 — 화면은 사용자 확인만으로 동작한다.
 */

export type ContractCheckData = {
  /** 저장된 계약서가 있나 */
  hasContract: boolean;
  /** 항목이 참조하는 계약서 추출 필드. 칸이 없거나 못 찾았으면 null */
  fields: Partial<Record<DocumentFieldKey, string | null>>;
  /** 계약서 agent_flag 가 "true"일 때만 true. 모르면 false */
  agentFlag: boolean;
  terms: Record<SpecialTermsGroup, SpecialTermsMatch>;
  /** 항목에 연결된 대조 결과 행만 */
  discrepancies: DiscrepancyDTO[];
};

const FIELD_KEYS_USED: DocumentFieldKey[] = CONTRACT_CHECK_RULES.flatMap((r) =>
  r.link.kind === 'fields' ? [...r.link.keys] : [],
);

const PAIRS_USED = CONTRACT_CHECK_RULES.flatMap((r) => (r.link.kind === 'compare' ? [...r.link.pairs] : []));

const GROUPS = Object.keys(SPECIAL_TERMS_KEYWORDS) as SpecialTermsGroup[];

export function buildContractCheckData(
  documents: readonly DocumentDTO[],
  discrepancies: readonly DiscrepancyDTO[],
): ContractCheckData {
  const contract = documents.find((d) => d.kind === 'contract');
  const value = (key: DocumentFieldKey): string | null =>
    contract?.fields.find((f) => f.fieldKey === key)?.value ?? null;

  const specialTerms = value('special_terms');

  return {
    hasContract: contract !== undefined,
    fields: Object.fromEntries(FIELD_KEYS_USED.map((k) => [k, value(k)])),
    agentFlag: value('agent_flag')?.trim().toLowerCase() === 'true',
    terms: Object.fromEntries(GROUPS.map((g) => [g, matchSpecialTerms(specialTerms, g)])) as Record<
      SpecialTermsGroup,
      SpecialTermsMatch
    >,
    discrepancies: discrepancies.filter((d) =>
      PAIRS_USED.some((p) => p.fieldKey === d.fieldKey && p.docA === d.docA && p.docB === d.docB),
    ),
  };
}

/** 문서를 못 읽었을 때 — 문서·대조 결과가 없는 것과 같다 */
export const EMPTY_CONTRACT_CHECK_DATA: ContractCheckData = buildContractCheckData([], []);
