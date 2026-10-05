import type { DiscrepancyStatus, DocumentKind } from '@/db/schema';
import { DOCUMENT_KIND_LABEL } from '@/lib/documents/fields';
import type { ComparePair } from './pairs';

/**
 * 대조 결과 문장 — 순수 함수 (V2-PLAN §4-1 "표시")
 *
 *   "{docA}에는 [{a}], {docB}에는 [{b}]로 기재되어 있습니다"
 *
 * ★ 중립 톤. 무엇이 맞는지, 무엇을 뜻하는지 말하지 않는다 (R1).
 *   status 라벨도 "기재 내용"만 말한다 — 위험·주의 같은 말을 쓰지 않는다.
 * ★ 한글·숫자 금액 중 어느 쪽이 우선인지 말하지 않는다 (V2-STATUS §6).
 */

/** 조사를 고를 마지막 글자 — 닫는 괄호·따옴표·마침표는 건너뛴다 */
function lastChar(word: string): string {
  return word.replace(/[\])}"'」』.\s]+$/u, '').slice(-1);
}

/** 받침 종류: 'none' 없음 · 'rieul' ㄹ · 'other' 그 밖 · null 모름. 한글 음절·숫자(읽는 소리)만 본다 */
function batchim(word: string): 'none' | 'rieul' | 'other' | null {
  const last = lastChar(word);
  if (!last) return null;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 ? 'none' : jong === 8 ? 'rieul' : 'other';
  }
  // 영 삼 육 → 그 밖 받침 · 일 칠 팔 → ㄹ · 나머지 → 없음
  if (/[036]/.test(last)) return 'other';
  if (/[178]/.test(last)) return 'rieul';
  if (/[2459]/.test(last)) return 'none';
  return null;
}

/** 조사 붙이기 — 쌍은 "받침 있을 때/없을 때" 순서. 받침을 모르면 뒤쪽(가·는·와·로) */
export function josa(word: string, pair: '이/가' | '은/는' | '과/와' | '으로/로'): string {
  const b = batchim(word);
  if (pair === '으로/로') return word + (b === 'other' ? '으로' : '로');
  const [withB, without] = pair.split('/');
  return word + (b === 'other' || b === 'rieul' ? withB : without);
}

export const STATUS_LABEL: Record<DiscrepancyStatus, string> = {
  same: '같게 기재',
  different: '다르게 기재',
  needs_review: '확인 필요 — 두 표기 나란히',
  missing_not_found: '찾지 못함',
  missing_not_applicable: '해당 없음',
};

/** 문서 이름 (+ 칸 이름). "등기부" · "계약서 임대인란" */
export function sideName(kind: DocumentKind, label?: string): string {
  return label ? `${DOCUMENT_KIND_LABEL[kind]} ${label}` : DOCUMENT_KIND_LABEL[kind];
}

/** 결과 한 행의 문장. 값은 원문 표기 그대로 괄호 안에 넣는다 */
export function discrepancySentence(
  pair: ComparePair,
  valueA: string | null,
  valueB: string | null,
  status: DiscrepancyStatus,
): string {
  const a = sideName(pair.a.kind, pair.a.label);
  const b = sideName(pair.b.kind, pair.b.label);

  if (status === 'missing_not_applicable') return '이 문서 조합·거래 유형에는 원래 없는 항목입니다.';
  if (valueA === null && valueB === null) return `${josa(a, '과/와')} ${b} 모두에서 찾지 못했습니다.`;
  if (valueA === null) return `${a}에서는 찾지 못했고, ${b}에는 ${josa(`[${valueB}]`, '으로/로')} 기재되어 있습니다.`;
  if (valueB === null) return `${a}에는 ${josa(`[${valueA}]`, '으로/로')} 기재되어 있고, ${b}에서는 찾지 못했습니다.`;
  return `${a}에는 [${valueA}], ${b}에는 ${josa(`[${valueB}]`, '으로/로')} 기재되어 있습니다.`;
}

/**
 * 질문으로 바꾸는 행 (A′ · V2-PLAN §4-2). 지금은 different만.
 * API-V2 §5-1은 needs_review·missing_not_found도 받을 수 있게 열어 두었지만, 그 둘의 질문 문구는
 * "다릅니다"가 아니어야 해서(R10 — 주소 표기 차이는 다른 것이 아니다) 문구가 정해지기 전까지 싣지 않는다.
 */
export const QUESTION_STATUSES: readonly DiscrepancyStatus[] = ['different'];

/** needs_review 행에 붙는 설명 — 왜 자동으로 가리지 않았는지만 말한다 */
export const NEEDS_REVIEW_NOTE =
  '표기 방식이 달라 같은 값인지 자동으로 가리지 않았습니다. 두 표기를 나란히 보고 확인하세요.';
