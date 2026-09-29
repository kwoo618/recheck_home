'use server';

import { revalidatePath } from 'next/cache';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { discrepancies, documentFields, documents, type Discrepancy } from '@/db/schema';
import { compareDocuments, type CompareDocument } from '@/lib/compare/compare';
import { COMPARE_PAIRS } from '@/lib/compare/pairs';
import { documentReadiness } from '@/lib/documents/readiness';
import type { ActionResult, DiscrepancyDTO } from '@/lib/types';
import { findOwnedProperty, NOT_FOUND } from './_shared';

/**
 * 대조 Server Actions (docs/API-V2.md §4)
 *
 * ★ R2: status는 lib/compare 순수 함수만 정한다. 이 파일은 DB에서 필드를 읽어 넘기고 결과를 저장만 한다.
 * ★ 멱등: property_id 기준 discrepancies 전량 삭제 후 재삽입 (V2-PLAN §8).
 *   Neon HTTP 드라이버는 트랜잭션이 없다 — 삭제 후 삽입이 실패하면 결과가 빈다.
 *   {ok:false}를 돌려주고, 다시 실행하면 복구된다.
 * ★ R7: address_detail · special_terms 는 대조 쌍에 없으므로 행이 생기지 않는다.
 * ★ 쓰기 액션은 예외를 던지지 않고 ActionResult를 돌려준다.
 */

const COMPARE_FAILED = '지금 대조할 수 없어요. 잠시 후 다시 시도해 주세요.';

/** 결과 정렬 — COMPARE_PAIRS 순서(API-V2 §4 "§1 표 순서로 고정"). 순위가 아니다 */
function pairOrder(d: Pick<Discrepancy, 'fieldKey' | 'docA' | 'docB'>): number {
  const i = COMPARE_PAIRS.findIndex((p) => p.fieldKey === d.fieldKey && p.a.kind === d.docA && p.b.kind === d.docB);
  return i === -1 ? COMPARE_PAIRS.length : i;
}

function toDTO(rows: Discrepancy[]): DiscrepancyDTO[] {
  return [...rows]
    .sort((a, b) => pairOrder(a) - pairOrder(b))
    .map((r) => ({
      id: r.id,
      fieldKey: r.fieldKey,
      docA: r.docA,
      docB: r.docB,
      valueA: r.valueA,
      valueB: r.valueB,
      status: r.status,
    }));
}

/** 대조 실행. 멱등 — property_id 기준 전량 삭제 후 재삽입 */
export async function runCompare(
  propertyId: string,
): Promise<ActionResult<{ discrepancies: DiscrepancyDTO[] }>> {
  try {
    const property = await findOwnedProperty(propertyId);
    if (!property) return { ok: false, error: NOT_FOUND };

    const docs = await db.select().from(documents).where(eq(documents.propertyId, property.id));
    const readiness = documentReadiness(docs.map((d) => d.kind));
    if (!readiness.canCompare) return { ok: false, error: readiness.reason ?? COMPARE_FAILED };

    const fieldRows =
      docs.length === 0
        ? []
        : await db.select().from(documentFields).where(inArray(documentFields.documentId, docs.map((d) => d.id)));

    const input: CompareDocument[] = docs.map((d) => ({
      kind: d.kind,
      fields: Object.fromEntries(
        fieldRows.filter((f) => f.documentId === d.id).map((f) => [f.fieldKey, f.value]),
      ),
    }));

    const rows = compareDocuments(input, { dealType: property.dealType });

    await db.delete(discrepancies).where(eq(discrepancies.propertyId, property.id));
    const inserted =
      rows.length === 0
        ? []
        : await db
            .insert(discrepancies)
            .values(rows.map((r) => ({ propertyId: property.id, ...r })))
            .returning();

    revalidatePath(`/property/${property.id}/documents`);
    revalidatePath(`/property/${property.id}/sheet`);
    return { ok: true, data: { discrepancies: toDTO(inserted) } };
  } catch {
    return { ok: false, error: COMPARE_FAILED };
  }
}

/** 마지막 대조 결과. 대조한 적 없으면 [] */
export async function listDiscrepancies(propertyId: string): Promise<DiscrepancyDTO[]> {
  const property = await findOwnedProperty(propertyId);
  if (!property) return [];

  const rows = await db.select().from(discrepancies).where(eq(discrepancies.propertyId, property.id));
  return toDTO(rows);
}
