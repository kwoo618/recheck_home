/**
 * 시연용 세션 식별 규약 — 단일 소스.
 *
 * `users.id` 는 uuid 컬럼이라 'demo-…' 같은 문자열을 넣을 수 없다.
 * 그래서 **UUID 앞부분을 예약**해 구분한다. 컬럼을 추가하면 마이그레이션이 되므로 규약으로 푼다.
 *
 * ★ 의존성이 없는 파일로 떼어 둔 이유:
 *   시딩 스크립트(`tests/e2e/seed-demo.mts`)는 번들러 없이 node 가 직접 실행하는데,
 *   `app/admin/_data.ts` 에 두면 `@/db` 별칭까지 딸려와 임포트가 실패한다.
 *   대시보드와 시딩이 **같은 상수를 봐야** 시연용/실사용 구분이 어긋나지 않는다.
 */

export const DEMO_SESSION_PREFIX = 'de100000';

/** 시연용 세션 id — 시딩과 집계가 같은 값을 쓴다 */
export const DEMO_SESSION_ID = `${DEMO_SESSION_PREFIX}-0000-4000-8000-000000000001`;

export function isDemoSession(userId: string): boolean {
  return userId.startsWith(DEMO_SESSION_PREFIX);
}
