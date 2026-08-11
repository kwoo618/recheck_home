'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, max, sql } from 'drizzle-orm';

import { db } from '@/db';
import { questions, type QuestionSource } from '@/db/schema';
import { QUESTION_BANK } from '@/lib/rules';
import type { ActionResult } from '@/lib/types';
import {
  NOT_FOUND,
  findOwnedProperty,
  markRecordedIfNeeded,
  touchProperty,
  toText,
} from './_shared';

/**
 * 조사지 ② "중개사에게 물어볼 것" Server Actions (PRD §5.3 · §5.5)
 *
 * 첫 자취생은 무엇을 걱정해야 할지 자체를 모른다.
 * 그래서 기본은 빈 입력창이 아니라 질문 은행(QUESTION_BANK) 선택이고,
 * AI는 "목록에 없는 고민"을 질문으로 바꾸는 데만 쓴다. (R3)
 */

/** 질문 은행의 모든 문장 — 은행 질문인지 검증할 때 쓴다 */
const BANK_TEXTS = new Set(Object.values(QUESTION_BANK).flat());

/* ══════════════════════════════════════════════════════════════
   국면 A — 질문 목록 편집
   ══════════════════════════════════════════════════════════════ */

/**
 * 질문 은행 항목 체크/해제.
 *
 * on=true  → 없으면 추가 (이미 있으면 아무 일도 하지 않음 — 멱등)
 * on=false → 해당 문장의 은행 질문을 삭제
 *
 * ★ 답변이 이미 입력된 질문은 체크 해제해도 지우지 않는다.
 *   기록은 사용자의 것이고, 체크박스 조작으로 현장 기록이 날아가면 안 된다. (PRD §1.2-5)
 */
export async function toggleBankQuestion(
  propertyId: string,
  text: string,
  on: boolean,
): Promise<ActionResult<void>> {
  const property = await findOwnedProperty(propertyId);
  if (!property) return { ok: false, error: NOT_FOUND };

  const value = toText(text);
  if (!value) return { ok: false, error: '질문 내용이 비어 있습니다.' };

  // 임의 문장이 은행 질문으로 저장되지 않도록 상수와 대조한다.
  if (!BANK_TEXTS.has(value)) {
    return { ok: false, error: '질문 은행에 없는 문장입니다.' };
  }

  const [existing] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.propertyId, propertyId), eq(questions.text, value)))
    .limit(1);

  if (on) {
    if (existing) return { ok: true, data: undefined }; // 멱등

    const [agg] = await db
      .select({ maxSort: max(questions.sort) })
      .from(questions)
      .where(eq(questions.propertyId, propertyId));

    await db.insert(questions).values({
      propertyId,
      text: value,
      source: 'bank',
      answer: '',
      noAnswer: false,
      sort: (agg?.maxSort ?? -1) + 1,
    });
  } else {
    if (!existing) return { ok: true, data: undefined }; // 멱등

    if (existing.answer !== '' || existing.noAnswer) {
      return {
        ok: false,
        error: '이미 답변을 기록한 질문입니다. 지우려면 질문 목록에서 직접 삭제해주세요.',
      };
    }

    await db.delete(questions).where(eq(questions.id, existing.id));
  }

  await touchProperty(propertyId);
  revalidatePath(`/property/${propertyId}`);

  return { ok: true, data: undefined };
}

/**
 * AI가 변환했거나 사용자가 직접 쓴 질문 추가.
 * source='ai'는 "AI가 만든 문장"이라는 출처 표시이므로 화면의 AI 배지와 1:1로 대응한다.
 */
export async function addQuestion(
  propertyId: string,
  text: string,
  source: QuestionSource = 'ai',
): Promise<ActionResult<{ id: string }>> {
  const property = await findOwnedProperty(propertyId);
  if (!property) return { ok: false, error: NOT_FOUND };

  const value = toText(text);
  if (!value) return { ok: false, error: '질문 내용을 입력해주세요.' };

  const [agg] = await db
    .select({ maxSort: max(questions.sort) })
    .from(questions)
    .where(eq(questions.propertyId, propertyId));

  const [created] = await db
    .insert(questions)
    .values({
      propertyId,
      text: value,
      source: source === 'bank' ? 'bank' : 'ai',
      answer: '',
      noAnswer: false,
      sort: (agg?.maxSort ?? -1) + 1,
    })
    .returning({ id: questions.id });

  await touchProperty(propertyId);
  revalidatePath(`/property/${propertyId}`);

  return { ok: true, data: { id: created.id } };
}

/** 질문 문장 수정. 출처(source)는 바꾸지 않는다 — 어디서 온 질문인지는 사실이므로 유지한다. */
export async function editQuestion(
  questionId: string,
  text: string,
): Promise<ActionResult<void>> {
  const owned = await findOwnedQuestion(questionId);
  if (!owned) return { ok: false, error: NOT_FOUND };

  const value = toText(text);
  if (!value) return { ok: false, error: '질문 내용을 입력해주세요.' };

  await db.update(questions).set({ text: value }).where(eq(questions.id, questionId));

  await touchProperty(owned.propertyId);
  revalidatePath(`/property/${owned.propertyId}`);

  return { ok: true, data: undefined };
}

export async function removeQuestion(questionId: string): Promise<ActionResult<void>> {
  const owned = await findOwnedQuestion(questionId);
  if (!owned) return { ok: false, error: NOT_FOUND };

  await db.delete(questions).where(eq(questions.id, questionId));

  await touchProperty(owned.propertyId);
  revalidatePath(`/property/${owned.propertyId}`);

  return { ok: true, data: undefined };
}

/* ══════════════════════════════════════════════════════════════
   국면 B — 답변 기록
   ══════════════════════════════════════════════════════════════ */

export type AnswerInput = {
  id: string;
  answer?: string;
  noAnswer?: boolean;
};

/**
 * 답변 일괄 저장 (PRD §5.5 — 답변 텍스트 + "못 들음" 토글).
 *
 * saveVisitResults와 같은 이유로 SELECT → 병합 → UPSERT 2회 왕복으로 처리한다.
 * "못 들음"은 답변 없음이 아니라 **물어봤지만 답을 듣지 못했다는 기록**이므로 진행률에 포함된다.
 */
export async function saveAnswers(
  propertyId: string,
  answers: AnswerInput[],
): Promise<ActionResult<{ saved: number }>> {
  const property = await findOwnedProperty(propertyId);
  if (!property) return { ok: false, error: NOT_FOUND };

  if (!Array.isArray(answers) || answers.length === 0) {
    return { ok: true, data: { saved: 0 } };
  }

  const existing = await db
    .select()
    .from(questions)
    .where(eq(questions.propertyId, propertyId));

  const byId = new Map(existing.map((e) => [e.id, e]));

  const rows = answers
    .map((input) => {
      const current = byId.get(input.id);
      if (!current) return null; // 다른 매물의 질문이거나 이미 삭제됨 — 무시

      const noAnswer = Boolean(input.noAnswer);

      return {
        ...current,
        // "못 들음"으로 표시하면 답변란은 비운다. 두 상태가 동시에 참일 수 없다.
        answer: noAnswer ? '' : toText(input.answer),
        noAnswer,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return { ok: true, data: { saved: 0 } };

  await db
    .insert(questions)
    .values(rows)
    .onConflictDoUpdate({
      target: questions.id,
      set: {
        answer: sql`excluded.answer`,
        noAnswer: sql`excluded.no_answer`,
      },
    });

  const hasRecord = rows.some((r) => r.answer !== '' || r.noAnswer);
  await markRecordedIfNeeded(property, hasRecord);
  await touchProperty(propertyId);

  revalidatePath('/');
  revalidatePath(`/property/${propertyId}`);

  return { ok: true, data: { saved: rows.length } };
}

/* ── 내부 ────────────────────────────────────────────────────── */

/** 질문 id만으로는 소유권을 알 수 없으므로 매물을 거쳐 확인한다 */
async function findOwnedQuestion(questionId: string) {
  if (!questionId) return null;

  const [row] = await db
    .select({ id: questions.id, propertyId: questions.propertyId })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);

  if (!row) return null;

  const property = await findOwnedProperty(row.propertyId);
  return property ? row : null;
}
