/**
 * 세션 쿠키 규약 — proxy.ts와 lib/session.ts가 공유하는 상수.
 *
 * proxy.ts에 DB 코드가 딸려 들어가지 않도록 상수만 별도 파일로 분리했다.
 * (proxy는 모든 요청마다 실행되므로 번들을 가볍게 유지한다)
 */

export const SESSION_COOKIE = 'rc_session';

/** 1년 */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,   // R6: 클라이언트 JS에서 읽을 이유가 없다
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_MAX_AGE,
  secure: process.env.NODE_ENV === 'production',
} as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 쿠키 값이 조작됐을 때 DB에 쓰레기 UUID가 들어가지 않도록 검증한다 */
export function isValidSessionId(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
