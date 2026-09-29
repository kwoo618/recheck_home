/**
 * 면책·안내 문구 — 단일 소스 (V2-PLAN §5 · CLAUDE.md "면책 문구는 한 곳에서만")
 *
 * 화면마다 문구를 따로 적으면 한 곳만 고쳐지고 나머지가 옛 표현으로 남는다.
 * 면책은 "서비스가 무엇을 말하지 않는가"를 정하는 문장이라 어긋나면 안 된다.
 *
 * ★ 순수 상수 모듈이다. 서버·클라이언트 양쪽에서 import한다. 'server-only'를 붙이지 않는다.
 * ★ 모든 문구는 containsBanned()를 통과해야 한다 (tests/finance.test.ts).
 * ★ 법령 수치·기관 명칭을 새로 넣으려면 확인을 먼저 받는다 (R8).
 */

/** 금융 화면에 상시 노출하는 면책 (FINANCE_ASSUMPTIONS와 짝 — 가정은 lib/finance.ts) */
export const FINANCE_DISCLAIMER =
  '본 계산은 참고용이며 금융상품 권유·투자자문이 아닙니다. 실제 대출 한도·금리·조건은 금융기관에서 확인하세요.';

/** 전월세전환 계산기에 결과 유무와 무관하게 상시 노출 */
export const RENT_CONVERSION_NOTICE =
  '법정 전월세전환율은 갱신 계약의 상한 기준이며, 신규 계약 협상에는 강제력이 없습니다. 실제 조건은 임대인과의 협의로 정해집니다.';

/*
 * 아직 여기로 옮기지 않은 것 (tests/glossary.test.ts가 원문 위치를 고정하고 있어 테스트 승인 후 이동):
 *   · compare-finance.tsx 전월세전환 계산기 맨 위 합의 안내
 */
