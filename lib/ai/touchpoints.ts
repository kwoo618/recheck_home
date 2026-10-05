import type { AiFeature } from '@/db/schema';

/**
 * AI 지점 등록표 — R3 단일 소스 (V2-PLAN §3)
 *
 * AI는 여기 등록된 지점에서만 쓴다. 새 지점을 추가하는 것은 승인 사항이다 (CLAUDE.md).
 * 각 지점은 판정 금지 프롬프트 + containsBanned() + 폴백 + ai_logs.touchpoint를 전부 갖춘다.
 *
 * ★ 순수 상수 모듈이다. 'server-only'를 붙이지 않는다 — 테스트와 관리자 화면이 같이 읽는다.
 * ★ status는 "코드 경로가 실제로 있는가"다. 계획만 있으면 planned.
 *   planned 지점은 logAi()로 기록할 수 없다 (tests/ai-guardrails.test.ts가 강제).
 */

export type TouchpointStatus = 'active' | 'planned';

export type Touchpoint = {
  /** 등록표 번호 ①~⑤ */
  no: 1 | 2 | 3 | 4 | 5;
  name: string;
  io: string;
  fallback: string;
  status: TouchpointStatus;
  /** ai_logs.feature(v1 호환 분류) 값 */
  feature: AiFeature;
};

export const TOUCHPOINTS = {
  listing_structure: {
    no: 1,
    name: '매물 텍스트 구조화',
    io: '붙여넣은 매물 텍스트 → 매물 필드 (+관리비 부과 방식)',
    fallback: '직접 입력',
    status: 'active',
    feature: 'parse',
  },
  question_convert: {
    no: 2,
    name: '질문 변환',
    io: '우려사항 · 문서 불일치 → 질문 문장',
    fallback: '질문 은행',
    status: 'active',
    feature: 'questions',
  },
  record_summary: {
    no: 3,
    name: '기록 차이 요약',
    io: '두 매물 이상의 조사 기록 → 차이 문장',
    fallback: '비교 표만',
    status: 'active',
    feature: 'summary',
  },
  document_structure: {
    no: 4,
    name: '문서 구조화',
    io: '등기부·계약서 PDF 텍스트 레이어 추출 텍스트(마스킹 후) → 공통 스키마 JSON, 미발견 null',
    fallback: '확인 화면 직접 입력',
    status: 'active',
    feature: 'document',
  },
  confirm_helper: {
    no: 5,
    name: '확인 도우미',
    io: '질문 → 용어·절차·다음 단계 + 근거',
    fallback: '도움말 화면',
    status: 'planned',
    feature: 'helper',
  },
} as const satisfies Record<string, Touchpoint>;

export type TouchpointId = keyof typeof TOUCHPOINTS;

export const TOUCHPOINT_IDS = Object.keys(TOUCHPOINTS) as TouchpointId[];

/** 외부에서 들어온 문자열이 등록된 지점 id인가 */
export function isTouchpointId(v: unknown): v is TouchpointId {
  return typeof v === 'string' && Object.hasOwn(TOUCHPOINTS, v);
}
