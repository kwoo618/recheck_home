'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';

import { db } from '@/db';
import { documentFields, documents, properties, type DocumentKind, type OcrSource } from '@/db/schema';
import { getSessionUserId } from '@/lib/session';
import { FIELD_KEYS, isDocumentKind } from '@/lib/documents/fields';
import { isAcceptedOcrSource, sanitizeFieldInputs } from '@/lib/documents/input';
import type { ActionResult, DocumentDTO, DocumentFieldInput } from '@/lib/types';
import { findOwnedProperty, NOT_FOUND, touchProperty } from './_shared';

/**
 * 문서 Server Actions (docs/API-V2.md §3)
 *
 * ★ R9: 원문·이미지·파일 경로를 받지 않는다. 확인 화면에서 사람이 검토한 **필드만** 저장한다.
 *   documents 테이블에는 원본 참조 컬럼이 없다.
 * ★ Neon HTTP 드라이버는 트랜잭션이 없다. 교체는 "새 문서·필드 삽입 → 성공하면 옛 문서 삭제" 순서로,
 *   중간에 실패해도 옛 값이 남게 한다. 필드 삽입이 실패하면 방금 만든 빈 문서를 지운다.
 * ★ 쓰기 액션은 예외를 던지지 않고 ActionResult를 돌려준다.
 */

const SAVE_FAILED = '지금 저장할 수 없어요. 잠시 후 다시 시도해 주세요.';

export type SaveDocumentInput = {
  propertyId: string;
  kind: DocumentKind;
  ocrSource: OcrSource;
  fields: DocumentFieldInput[];
};

/** 확인 화면 [저장]. 같은 매물·같은 kind의 기존 문서가 있으면 교체한다 (매물당 kind별 1건) */
export async function saveDocument(input: SaveDocumentInput): Promise<ActionResult<{ documentId: string }>> {
  if (!isDocumentKind(input?.kind)) return { ok: false, error: '문서 종류가 올바르지 않습니다.' };
  if (!isAcceptedOcrSource(input.ocrSource)) return { ok: false, error: '문서 출처가 올바르지 않습니다.' };

  const sanitized = sanitizeFieldInputs(input.kind, input.fields);
  if (!sanitized.ok) return { ok: false, error: sanitized.error };

  let createdId: string | null = null;
  try {
    const property = await findOwnedProperty(input.propertyId);
    if (!property) return { ok: false, error: NOT_FOUND };

    const [created] = await db
      .insert(documents)
      .values({ propertyId: property.id, kind: input.kind, ocrSource: input.ocrSource })
      .returning({ id: documents.id });
    createdId = created.id;

    if (sanitized.fields.length > 0) {
      await db.insert(documentFields).values(
        sanitized.fields.map((f) => ({
          documentId: created.id,
          fieldKey: f.fieldKey,
          value: f.value,
          bbox: f.bbox,
          confidence: f.confidence,
          editedByUser: f.editedByUser,
        })),
      );
    }

    // 새 문서가 온전히 들어간 뒤에야 옛 문서를 지운다 (필드는 FK cascade)
    await db
      .delete(documents)
      .where(
        and(
          eq(documents.propertyId, property.id),
          eq(documents.kind, input.kind),
          ne(documents.id, created.id),
        ),
      );

    await touchProperty(property.id);
  } catch {
    if (createdId) {
      try {
        await db.delete(documents).where(eq(documents.id, createdId));
      } catch {
        // 정리 실패 — 다음 저장이 같은 kind의 옛 문서를 지우므로 남아도 복구된다
      }
    }
    return { ok: false, error: SAVE_FAILED };
  }

  revalidatePath(`/property/${input.propertyId}`);
  return { ok: true, data: { documentId: createdId } };
}

/** 매물의 문서 목록 + 필드. 원본은 없다 — 원본은 IndexedDB에서 클라이언트가 찾는다 */
export async function listDocuments(propertyId: string): Promise<DocumentDTO[]> {
  const property = await findOwnedProperty(propertyId);
  if (!property) return [];

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.propertyId, property.id))
    .orderBy(asc(documents.createdAt));
  if (docs.length === 0) return [];

  const rows = await db
    .select()
    .from(documentFields)
    .where(inArray(documentFields.documentId, docs.map((d) => d.id)));

  const order = (key: string) => {
    const i = FIELD_KEYS.indexOf(key as (typeof FIELD_KEYS)[number]);
    return i === -1 ? FIELD_KEYS.length : i;
  };

  return docs.map((d) => ({
    id: d.id,
    kind: d.kind,
    ocrSource: d.ocrSource,
    createdAt: d.createdAt.toISOString(),
    fields: rows
      .filter((r) => r.documentId === d.id)
      .sort((a, b) => order(a.fieldKey) - order(b.fieldKey))
      .map((r) => ({
        id: r.id,
        fieldKey: r.fieldKey,
        value: r.value,
        bbox: r.bbox ?? null,
        confidence: r.confidence,
        editedByUser: r.editedByUser,
      })),
  }));
}

/** 서버 쪽 추출 필드만 지운다. IndexedDB 원본 삭제는 클라이언트 몫 */
export async function deleteDocument(documentId: string): Promise<ActionResult<void>> {
  if (!documentId) return { ok: false, error: '문서를 찾을 수 없습니다.' };

  try {
    const userId = await getSessionUserId();

    // 문서 → 매물 → 세션 소유권. 남의 문서는 없는 것으로 취급한다
    const [owned] = await db
      .select({ id: documents.id, propertyId: documents.propertyId })
      .from(documents)
      .innerJoin(properties, eq(properties.id, documents.propertyId))
      .where(and(eq(documents.id, documentId), eq(properties.userId, userId)))
      .limit(1);
    if (!owned) return { ok: false, error: '문서를 찾을 수 없습니다.' };

    await db.delete(documents).where(eq(documents.id, owned.id));
    await touchProperty(owned.propertyId);

    revalidatePath(`/property/${owned.propertyId}`);
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: '지금 지울 수 없어요. 잠시 후 다시 시도해 주세요.' };
  }
}
