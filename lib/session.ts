import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { FinanceProfile } from '@/db/schema';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  isValidSessionId,
} from './session-cookie';

/**
 * 익명 세션 (PRD v2.1 §8.1)
 *
 * 흐름:
 *   proxy.ts가 쿠키(UUID)를 발급 → 여기서 users 행을 보장 → userId 반환.
 *
 * ★ R6: 쿠키는 httpOnly. 세션 id가 클라이언트 번들에 들어가지 않는다.
 * ★ React cache()로 요청 단위 메모이즈 — 한 요청에서 여러 번 호출해도 INSERT는 1회.
 */

/** 쿠키에서 세션 id를 읽는다. 없으면 null (proxy가 다음 요청에 발급) */
export async function readSessionId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  return isValidSessionId(value) ? value : null;
}

/**
 * 세션 id를 확정하고 users 행을 보장한 뒤 userId를 반환한다.
 *
 * 쿠키가 없는 경우(= proxy를 타지 않은 경로)에도 서비스가 멈추지 않도록
 * 즉석에서 발급을 시도한다. 렌더 중이라 쿠키 쓰기가 막히면 조용히 넘어가고,
 * proxy가 다음 요청에서 정식 발급한다.
 */
export const getSessionUserId = cache(async (): Promise<string> => {
  let id = await readSessionId();

  if (!id) {
    id = crypto.randomUUID();
    try {
      const store = await cookies();
      store.set({ name: SESSION_COOKIE, value: id, ...SESSION_COOKIE_OPTIONS });
    } catch {
      // 서버 컴포넌트 렌더 중에는 쿠키를 쓸 수 없다. proxy가 다음 요청에 발급한다.
    }
  }

  // ★ DB 실패를 삼키지 않는다 (docs/v1/V1-OUT-OF-SCOPE §4-2).
  //   여기서 id만 돌려주면 "세션은 있는데 데이터가 없는" 상태가 되어 빈 목록이 뜨고,
  //   사용자는 매물이 사라졌다고 오해한다. 이름 붙은 오류로 바꿔 올리고 app/error.tsx가 받는다.
  try {
    await db.insert(users).values({ id }).onConflictDoNothing();
  } catch (cause) {
    throw new SessionStoreUnavailableError(cause);
  }

  return id;
});

/**
 * 세션 저장소(DB)에 닿지 못했다.
 * 운영 빌드에서는 오류 메시지가 클라이언트로 가지 않는다(digest만 간다) — 화면은 이 이름에 기대지 않는다.
 */
export class SessionStoreUnavailableError extends Error {
  constructor(cause: unknown) {
    super('세션 저장소에 연결하지 못했습니다.', { cause });
    this.name = 'SessionStoreUnavailableError';
  }
}

/** 금융 프로필 조회 — 사용자당 1개 (PRD §8.4 getFinance) */
export async function getFinanceProfile(): Promise<FinanceProfile> {
  const userId = await getSessionUserId();
  const [row] = await db
    .select({ finance: users.finance })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row?.finance ?? {};
}
