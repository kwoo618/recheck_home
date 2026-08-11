import { NextResponse } from 'next/server';

/**
 * ⚠ 임시 라우트 — Vercel 배포에서 DATABASE_URL이 실제로 연결되는지 확인하는 용도.
 *    D2 작업 시작 전에 이 파일을 삭제한다. (배포 환경 점검이 끝나면 존재할 이유가 없다)
 *
 * 설계:
 *   · 실패해도 항상 HTTP 200 + {ok:false} — 상태 코드가 아니라 본문으로 판정한다 (R4)
 *   · db 모듈을 동적 import 한다. db/index.ts는 DATABASE_URL이 없으면 모듈 로드 시점에
 *     throw 하므로, 정적 import를 쓰면 빌드 단계에서 터질 수 있다.
 *   · 에러 메시지에서 연결 문자열·자격증명을 제거한 뒤 반환한다.
 *     이 엔드포인트는 인터넷에 공개되므로 원본 메시지를 그대로 노출하지 않는다. (R6)
 */

// 요청 시점에 DB를 조회해야 하므로 프리렌더 대상에서 제외한다.
export const dynamic = 'force-dynamic';

/** postgres 연결 문자열·자격증명이 메시지에 섞여 나오는 경우를 지운다 */
function redact(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[redacted-connection-string]')
    .replace(/\/\/[^@\s/]+:[^@\s/]+@/g, '//[redacted-credentials]@')
    .slice(0, 200);
}

export async function GET() {
  try {
    const [{ db }, { users }, { count }] = await Promise.all([
      import('@/db'),
      import('@/db/schema'),
      import('drizzle-orm'),
    ]);

    const [row] = await db.select({ value: count() }).from(users);

    return NextResponse.json({ ok: true, count: row?.value ?? 0 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: redact(message) });
  }
}
