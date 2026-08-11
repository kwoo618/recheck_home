import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  isValidSessionId,
} from '@/lib/session-cookie';

/**
 * 익명 세션 쿠키 발급 (PRD v2.1 §8.1 — 인증: 익명 세션 UUID 쿠키)
 *
 * 왜 여기서 발급하는가:
 *   Next.js는 서버 컴포넌트 "렌더 중"에 쿠키를 쓰는 것을 허용하지 않는다.
 *   따라서 첫 방문자의 쿠키는 렌더보다 앞선 이 단계에서 발급해야 한다.
 *
 * ★ Next 16에서 middleware.ts → proxy.ts로 규약이 변경됨(구 이름은 deprecated).
 * ★ 여기서는 DB를 건드리지 않는다. users 행 생성은 lib/session.ts가 담당한다.
 */
export function proxy(request: NextRequest) {
  const existing = request.cookies.get(SESSION_COOKIE)?.value;

  if (isValidSessionId(existing)) {
    return NextResponse.next();
  }

  const id = crypto.randomUUID();

  // 이번 요청의 서버 컴포넌트/액션이 즉시 읽을 수 있도록 요청 쿠키에도 심는다.
  request.cookies.set(SESSION_COOKIE, id);
  const response = NextResponse.next({ request });

  // 브라우저에 저장시킨다.
  response.cookies.set({
    name: SESSION_COOKIE,
    value: id,
    ...SESSION_COOKIE_OPTIONS,
  });

  return response;
}

export const config = {
  /*
   * 제외 대상:
   *   · 정적 자산·이미지 최적화 경로 — 세션이 필요 없다.
   *   · /api/** — **여기서 쿠키를 발급하면 안 된다.**
   *     API 라우트는 우리 카카오·Gemini 키로 외부 API를 호출한다.
   *     proxy가 모든 요청에 세션을 발급하면 라우트의 세션 검사가 항상 통과해
   *     보호처럼 보이는 죽은 코드가 되고, 배포 URL을 아는 누구나 쿼터를 소진시킬 수 있다.
   *     화면은 항상 페이지를 먼저 거치므로 정상 사용자는 이미 쿠키를 갖고 있다.
   *
   * `api/`로 매칭한다 — `api`로 하면 `/apiary` 같은 페이지 경로까지 제외된다.
   */
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
