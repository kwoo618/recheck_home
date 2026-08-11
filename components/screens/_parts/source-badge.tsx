/**
 * 출처 배지 (CLAUDE.md UI 규약) — 모든 데이터 섹션 제목 옆에 붙는다.
 *
 *   rule     규칙 기반 (틸)   결정론 코드가 만든 것
 *   ai       AI (보라)        AI 가 만든 것
 *   user     직접 입력 (회색) 사용자가 쓴 것
 *   template 템플릿 (외곽선)  AI 실패 시 결정론 폴백. AI 가 만든 게 아니므로 'AI' 배지를 붙이지 않는다
 */
export type SourceKind = 'rule' | 'ai' | 'user' | 'template';

const DEFAULT_LABEL: Record<SourceKind, string> = {
  rule: '규칙 기반',
  ai: 'AI',
  user: '직접 입력',
  template: '템플릿',
};

const CLASS: Record<SourceKind, string> = {
  rule: 'rc-src-rule',
  ai: 'rc-src-ai',
  user: 'rc-src-user',
  template: 'rc-src-template',
};

export function SourceBadge({ kind, label }: { kind: SourceKind; label?: string }) {
  return <span className={`rc-src ${CLASS[kind]}`}>{label ?? DEFAULT_LABEL[kind]}</span>;
}
