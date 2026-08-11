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

  await db.insert(users).values({ id }).onConflictDoNothing();

  return id;
});

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
