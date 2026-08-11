import { QUESTION_BANK } from '@/lib/rules';
import type { QuestionDTO } from '@/lib/types';
import { SourceBadge } from './source-badge';

/**
 * 질문의 출처 배지.
 *
 * QuestionSource 는 계약상 'bank' | 'ai' 둘뿐이라 값을 늘리지 않는다.
 * 대신 "질문 은행에 실제로 있는 문구인가"로 템플릿을 가려낸다:
 *
 *   ai                        → AI 변환
 *   bank + 은행에 있는 문구   → 질문 은행
 *   bank + 은행에 없는 문구   → 템플릿 (AI 실패 폴백 · 협상 질문)
 *
 * 템플릿 문구는 결정론 코드가 만든 것이므로 'AI' 배지를 붙이면 거짓이 된다.
 * 반대로 '질문 은행'이라 부르면 목록에서 고른 것으로 오해한다.
 */
const BANK_TEXTS = new Set(Object.values(QUESTION_BANK).flat());

export function isBankQuestion(text: string): boolean {
  return BANK_TEXTS.has(text);
}

export function QuestionBadge({ question }: { question: Pick<QuestionDTO, 'source' | 'text'> }) {
  if (question.source === 'ai') return <SourceBadge kind="ai" label="AI 변환" />;
  if (isBankQuestion(question.text)) return <SourceBadge kind="rule" label="질문 은행" />;
  return <SourceBadge kind="template" />;
}
