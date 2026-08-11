'use server';

import { revalidatePath } from 'next/cache';
import { eq, max, sql } from 'drizzle-orm';

import { db } from '@/db';
import { visitChecks, type VisitResult } from '@/db/schema';
import type { ActionResult } from '@/lib/types';
import {
  NOT_FOUND,
  findOwnedProperty,
  markRecordedIfNeeded,
  touchProperty,
  toText,
} from './_shared';

/**
 * 조사지 ① "직접 확인할 것" Server Actions (PRD §5.3 · §5.5)
 *
 * 시점 원칙(R5):
 *   · 국면 A(방문 준비) — 항목 목록만 만든다. addVisitCheck/removeVisitCheck.
 *   · 국면 B(방문 기록) — 결과를 입력한다. saveVisitResults.
 *   항목을 만드는 시점에 result는 항상 ''다. 방문 전에는 체크할 수 없다.
 */

const VALID_RESULTS: VisitResult[] = ['', 'good', 'ok', 'bad', 'na'];

function toResult(v: unknown): VisitResult {
  return VALID_RESULTS.includes(v as VisitResult) ? (v as VisitResult) : '';
}

/* ══════════════════════════════════════════════════════════════
   국면 A — 항목 편집
   ══════════════════════════════════════════════════════════════ */

export type AddVisitCheckInput = {
  title: string;
  description?: string;
};

/**
 * 사용자가 직접 추가하는 확인 항목.
 * 규칙이 선정한 항목이 아니므로 ruleId='custom'으로 표시한다.
 * 이 표시 덕분에 조건 변경으로 조사지를 재생성할 때도 삭제되지 않는다.
 */
export async function addVisitCheck(
  propertyId: string,
  input: AddVisitCheckInput,
): Promise<ActionResult<{ id: string }>> {
  const property = await findOwnedProperty(propertyId);
  if (!property) return { ok: false, error: NOT_FOUND };

  const title = toText(input.title);
  if (!title) return { ok: false, error: '확인할 항목을 입력해주세요.' };

  const [agg] = await db
    .select({ maxSort: max(visitChecks.sort) })
    .from(visitChecks)
    .where(eq(visitChecks.propertyId, propertyId));

  const [created] = await db
    .insert(visitChecks)
    .values({
      propertyId,
      ruleId: 'custom',
      category: '추가',
      title,
      description: toText(input.description),
      // ★ R5: 방문 전이므로 결과는 비워 둔다.
      result: '',
      memo: '',
      sort: (agg?.maxSort ?? -1) + 1,
    })
    .returning({ id: visitChecks.id });

  await touchProperty(propertyId);
  revalidatePath(`/property/${propertyId}`);

  return { ok: true, data: { id: created.id } };
}

/**
 * 확인 항목 삭제.
 * 규칙이 선정한 항목도 지울 수 있다 — 조사지는 사용자가 편집하는 것이다(PRD §5.3).
 */
export async function removeVisitCheck(checkId: string): Promise<ActionResult<void>> {
  if (!checkId) return { ok: false, error: NOT_FOUND };

  // 체크 id만으로는 소유권을 알 수 없으므로 매물을 거쳐 확인한다.
  const [row] = await db
    .select({ propertyId: visitChecks.propertyId })
    .from(visitChecks)
    .where(eq(visitChecks.id, checkId))
    .limit(1);

  if (!row) return { ok: false, error: NOT_FOUND };

  const property = await findOwnedProperty(row.propertyId);
  if (!property) return { ok: false, error: NOT_FOUND };

  await db.delete(visitChecks).where(eq(visitChecks.id, checkId));

  await touchProperty(row.propertyId);
  revalidatePath(`/property/${row.propertyId}`);

  return { ok: true, data: undefined };
}

/* ══════════════════════════════════════════════════════════════
   국면 B — 방문 결과 입력
   ══════════════════════════════════════════════════════════════ */

export type VisitResultInput = {
  id: string;
  result?: VisitResult | string;
  memo?: string;
};

/**
 * 방문 결과 일괄 저장 (PRD §5.5 — 4택 + '문제있음' 메모).
 *
 * Neon HTTP 드라이버에는 트랜잭션이 없다. 항목마다 UPDATE를 날리면
 * 12개 항목에 12번 왕복이므로, 기존 행을 한 번 읽어 병합한 뒤
 * INSERT … ON CONFLICT DO UPDATE로 한 번에 쓴다 (왕복 2회).
 *
 * 입력에 없는 항목은 건드리지 않는다. 화면이 일부만 보내도 나머지가 지워지지 않는다.
 */
export async function saveVisitResults(
  propertyId: string,
  results: VisitResultInput[],
): Promise<ActionResult<{ saved: number }>> {
  const property = await findOwnedProperty(propertyId);
  if (!property) return { ok: false, error: NOT_FOUND };

  if (!Array.isArray(results) || results.length === 0) {
    return { ok: true, data: { saved: 0 } };
  }

  const existing = await db
    .select()
    .from(visitChecks)
    .where(eq(visitChecks.propertyId, propertyId));

  const byId = new Map(existing.map((e) => [e.id, e]));

  const rows = results
    .map((input) => {
      const current = byId.get(input.id);
      if (!current) return null; // 다른 매물의 항목이거나 이미 삭제됨 — 무시

      const result = toResult(input.result);

      return {
        ...current,
        result,
        // '문제있음'이 아닌 결과로 바꾸면 메모는 화면에서 사라지므로 함께 비운다.
        memo: result === 'bad' ? toText(input.memo) : '',
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return { ok: true, data: { saved: 0 } };

  await db
    .insert(visitChecks)
    .values(rows)
    .onConflictDoUpdate({
      target: visitChecks.id,
      set: {
        result: sql`excluded.result`,
        memo: sql`excluded.memo`,
      },
    });

  // '미확인(na)'은 기록을 시도했다는 뜻이므로 기록으로 인정한다. 빈 값만 기록이 아니다.
  const hasRecord = rows.some((r) => r.result !== '');
  await markRecordedIfNeeded(property, hasRecord);
  await touchProperty(propertyId);

  revalidatePath('/');
  revalidatePath(`/property/${propertyId}`);

  return { ok: true, data: { saved: rows.length } };
}

/*
 * 조사지 완성(prep → ready)은 기존 setStatus(id, 'ready')로 처리한다.
 * 상태 전이 경로를 하나로 유지해야 canTransition 검증이 한 군데에만 남는다.
 */
