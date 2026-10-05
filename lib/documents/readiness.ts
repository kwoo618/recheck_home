import type { DocumentKind } from '@/db/schema';
import { DOCUMENT_KINDS, DOCUMENT_KIND_LABEL } from './fields';

/**
 * 문서 준비 상태 (V2-PLAN §4-3) — "등기부 ○ · 광고 ○ · 계약서 ×"
 *
 * 대조는 문서 종류 2종 이상에서만 연다. 대조 액션(runCompare, 4단계)의 선행 조건 문구도
 * 이 함수의 reason을 그대로 쓴다 (docs/API-V2.md §4 "문구는 준비 상태 패널과 같게").
 *
 * ★ 순수 함수. "저장된 문서의 kind 목록"만 받는다 — 기기에 원본만 있고 확인·저장하지 않은
 *   문서는 대조할 필드가 없으므로 세지 않는다.
 */

export const MIN_KINDS_FOR_COMPARE = 2;

export type DocumentReadiness = {
  have: Record<DocumentKind, boolean>;
  count: number;
  canCompare: boolean;
  /** "등기부 ○ · 광고 ○ · 계약서 ×" */
  summary: string;
  /** canCompare가 false일 때 버튼 옆에 보이는 이유. true면 null */
  reason: string | null;
};

export function documentReadiness(kinds: readonly DocumentKind[]): DocumentReadiness {
  const have: Record<DocumentKind, boolean> = { ad: false, registry: false, contract: false };
  for (const k of kinds) if (k in have) have[k] = true;

  const count = DOCUMENT_KINDS.filter((k) => have[k]).length;
  const canCompare = count >= MIN_KINDS_FOR_COMPARE;
  const summary = DOCUMENT_KINDS.map((k) => `${DOCUMENT_KIND_LABEL[k]} ${have[k] ? '○' : '×'}`).join(' · ');

  let reason: string | null = null;
  if (!canCompare) {
    const missing = DOCUMENT_KINDS.filter((k) => !have[k]).map((k) => DOCUMENT_KIND_LABEL[k]);
    reason =
      count === 0
        ? `대조하려면 문서가 2종 이상 필요합니다. 아직 확인·저장한 문서가 없습니다.`
        : `대조하려면 문서가 2종 이상 필요합니다. ${missing.join('·')} 중 하나를 더 확인·저장해 주세요.`;
  }

  return { have, count, canCompare, summary, reason };
}
