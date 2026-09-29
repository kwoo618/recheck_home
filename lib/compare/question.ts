import type { DiscrepancyStatus, DocumentKind } from '@/db/schema';
import { DOCUMENT_KIND_LABEL } from '@/lib/documents/fields';
import { discrepancyFallbackQuestion } from '@/lib/rules';
import { findPair } from './pairs';
import { QUESTION_STATUSES } from './text';

/**
 * 대조 결과 행 → 조사지 "문서에서 확인된 차이" 기본 질문 (V2-PLAN §4-2) — 순수 함수.
 * 규칙 템플릿(lib/rules.ts)이다. 지점 ②로 다듬은 문장은 화면이 따로 들고 있다.
 * 질문으로 바꾸지 않는 행(QUESTION_STATUSES 밖)·알 수 없는 쌍이면 null.
 */
export function discrepancyTemplateQuestion(row: {
  fieldKey: string;
  docA: DocumentKind;
  docB: DocumentKind;
  status: DiscrepancyStatus;
}): string | null {
  if (!QUESTION_STATUSES.includes(row.status)) return null;
  const pair = findPair(row.fieldKey, row.docA, row.docB);
  if (!pair) return null;
  return discrepancyFallbackQuestion(
    pair.questionField ?? pair.label,
    DOCUMENT_KIND_LABEL[row.docA],
    DOCUMENT_KIND_LABEL[row.docB],
  );
}
