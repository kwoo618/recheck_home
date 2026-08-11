import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { properties, type Property } from '@/db/schema';
import { getSessionUserId } from '@/lib/session';
import { canTransition } from '@/lib/rules';

/**
 * Server Action 공통 헬퍼.
 *
 * 모든 액션은 "이 매물이 내 세션 것인가"를 가장 먼저 확인한다.
 * 남의 매물은 권한 오류가 아니라 **없는 것**으로 취급한다 —
 * "권한이 없습니다"는 그 id의 매물이 존재한다는 사실을 알려주기 때문이다.
 */

/** 소유권 확인 실패 시 프론트에 그대로 노출할 문구 (존재 여부를 드러내지 않는다) */
export const NOT_FOUND = '매물을 찾을 수 없습니다.';

/**
 * 매물 소유권을 확인하고 행을 돌려준다. 내 것이 아니면 null.
 * 필요한 컬럼만 쓰는 호출부가 많지만, 상태 전이 판단에 status가 자주 필요해 전체 행을 반환한다.
 */
export async function findOwnedProperty(propertyId: string): Promise<Property | null> {
  if (!propertyId) return null;

  const userId = await getSessionUserId();

  const [row] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)))
    .limit(1);

  return row ?? null;
}

/** properties.updatedAt 갱신 — 하위 데이터(조사지·질문·체크)가 바뀔 때도 매물이 변경된 것으로 본다 */
export async function touchProperty(propertyId: string): Promise<void> {
  await db
    .update(properties)
    .set({ updatedAt: new Date() })
    .where(eq(properties.id, propertyId));
}

/**
 * 방문 기록이 실제로 들어왔을 때 ready → recorded 전이 (PRD §3 "ready ─기록저장→ recorded").
 *
 * 빈 저장(아무것도 입력하지 않고 [저장]만 누른 경우)으로는 전이하지 않는다.
 * 전이 허용 여부는 여기서 판단하지 않고 canTransition()에 맡긴다.
 * ready가 아닌 상태(prep·recorded·confirmed·excluded)에서는 조용히 아무 일도 하지 않는다.
 */
export async function markRecordedIfNeeded(
  property: Property,
  hasRecord: boolean,
): Promise<void> {
  if (!hasRecord) return;
  if (!canTransition(property.status, 'recorded')) return;

  await db
    .update(properties)
    .set({ status: 'recorded', updatedAt: new Date() })
    .where(eq(properties.id, property.id));
}

/* ── 입력 정규화 ─────────────────────────────────────────────── */

export function toText(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

/** 만원 단위 금액 — 음수는 0으로 보정, 소수점 버림 */
export function toAmount(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback;
}

/** 이율(%) — 음수는 0으로 보정, 소수점 유지 */
export function toRate(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}
