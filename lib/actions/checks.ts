'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { properties, users, type CheckMap, type FinanceProfile } from '@/db/schema';
import { SAFETY_RULES, CONTRACT_DAY, AFTER_STEPS } from '@/lib/rules';
import { getSessionUserId, getFinanceProfile } from '@/lib/session';
import type { ActionResult } from '@/lib/types';
import { NOT_FOUND, findOwnedProperty, toAmount, toRate } from './_shared';

/**
 * 계약 전 안전 점검 · 계약 후 절차 체크 + 금융 프로필 Server Actions
 * (PRD §5.7 · §5.8 · §6)
 *
 * 체크 상태는 규칙 id를 키로 쓰는 JSONB다.
 * 규칙 상수는 DB가 아니라 lib/rules.ts에 있으므로, 여기서는 **들어온 ruleId가
 * 그 그룹의 실제 규칙인지 검증**한 뒤에만 저장한다. 검증이 없으면 임의 키로
 * JSONB가 오염되고, 나중에 규칙과 대조할 때 정체불명의 키가 남는다.
 */

export type CheckGroup = 'safety' | 'contract' | 'after';

/** 그룹별 허용 규칙 id 집합 — 조건(cond)과 무관하게 "존재하는 id"인지만 본다 */
const VALID_RULE_IDS: Record<CheckGroup, Set<string>> = {
  safety: new Set(SAFETY_RULES.map((r) => r.id)),
  contract: new Set(CONTRACT_DAY.map((c) => c.id)),
  after: new Set(AFTER_STEPS.flatMap((g) => g.items.map((i) => i.id))),
};

/** 그룹 → 현재 체크 맵 */
function currentMap(
  group: CheckGroup,
  p: { safetyChecks: CheckMap; contractChecks: CheckMap; afterChecks: CheckMap },
): CheckMap {
  if (group === 'safety') return p.safetyChecks;
  if (group === 'contract') return p.contractChecks;
  return p.afterChecks;
}

/**
 * 그룹 → UPDATE에 넣을 SET 절.
 * 컬럼을 변수로 담으면 Drizzle의 컬럼 타입이 서로 달라 타입이 좁혀지지 않으므로,
 * 분기마다 리터럴로 만든다.
 */
function patchFor(group: CheckGroup, next: CheckMap) {
  const updatedAt = new Date();
  if (group === 'safety') return { safetyChecks: next, updatedAt };
  if (group === 'contract') return { contractChecks: next, updatedAt };
  return { afterChecks: next, updatedAt };
}

function isCheckGroup(v: unknown): v is CheckGroup {
  return v === 'safety' || v === 'contract' || v === 'after';
}

/**
 * 점검 항목 체크/해제.
 *
 * ★ 이 함수는 "확인했다"는 사실만 기록한다. 필수 항목이 몇 개 남았는지 세는 것은
 *   화면이 규칙(critical 플래그)과 대조해 하는 일이고, 그것도 분류이지 판정이 아니다.
 *
 * on=false면 키를 false로 두지 않고 **삭제**한다. JSONB에 false가 쌓이면
 * "체크 해제한 것"과 "애초에 해당 없는 것"을 구분할 수 없게 된다.
 */
export async function toggleCheck(
  propertyId: string,
  group: CheckGroup,
  ruleId: string,
  on: boolean,
): Promise<ActionResult<void>> {
  const property = await findOwnedProperty(propertyId);
  if (!property) return { ok: false, error: NOT_FOUND };

  if (!isCheckGroup(group)) {
    return { ok: false, error: '알 수 없는 점검 그룹입니다.' };
  }

  if (!VALID_RULE_IDS[group].has(ruleId)) {
    return { ok: false, error: `${group} 그룹에 없는 점검 항목입니다: ${ruleId}` };
  }

  const next: CheckMap = { ...currentMap(group, property) };

  if (on) next[ruleId] = true;
  else delete next[ruleId];

  await db
    .update(properties)
    .set(patchFor(group, next))
    .where(eq(properties.id, propertyId));

  revalidatePath('/');
  revalidatePath(`/property/${propertyId}`);

  return { ok: true, data: undefined };
}

/* ══════════════════════════════════════════════════════════════
   금융 프로필 — 사용자당 1개 (PRD §6)
   ══════════════════════════════════════════════════════════════ */

/** 금융 프로필 조회. 저장한 적이 없으면 빈 객체 */
export async function getFinance(): Promise<FinanceProfile> {
  return getFinanceProfile();
}

/**
 * 금융 프로필 저장.
 *
 * ★ cvRate(전월세전환율)에 기본값을 넣지 않는다. 사용자가 입력한 값만 저장한다.
 *   법정 전환율은 기준금리 연동이라 시점에 따라 바뀌고, 화면에 미리 뜬 숫자를
 *   사용자는 "서비스가 알려준 기준"으로 받아들인다. 기본값 제공 자체가 판정에 해당한다. (R1·R8)
 *
 * 알려진 4개 필드만 통과시킨다. 임의 키가 JSONB에 섞이면 나중에 타입과 어긋난다.
 */
export async function saveFinance(input: FinanceProfile): Promise<ActionResult<void>> {
  const userId = await getSessionUserId();

  const profile: FinanceProfile = {};

  if (input?.cash !== undefined) profile.cash = toAmount(input.cash);
  if (input?.loanCap !== undefined) profile.loanCap = toAmount(input.loanCap);
  if (input?.rate !== undefined) profile.rate = toRate(input.rate);
  if (input?.cvRate !== undefined) profile.cvRate = toRate(input.cvRate);

  await db.update(users).set({ finance: profile }).where(eq(users.id, userId));

  revalidatePath('/');

  return { ok: true, data: undefined };
}
