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
  // 정적 자산·이미지 최적화 경로는 세션이 필요 없으므로 제외한다.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
