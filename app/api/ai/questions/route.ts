import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { discrepancies, properties, type DiscrepancyStatus, type DocumentKind } from '@/db/schema';
import { NOT_FOUND } from '@/lib/actions/_shared';
import { generate, logAi } from '@/lib/ai/gemini';
import { normalizeQuestions, parseJsonDetailed, RECOVERY_MARK } from '@/lib/ai/normalize';
import { DISCREPANCY_QUESTIONS_SYSTEM, QUESTIONS_SYSTEM, wrapUserInput } from '@/lib/ai/prompts';
import { findPair } from '@/lib/compare/pairs';
import { discrepancyTemplateQuestion } from '@/lib/compare/question';
import { QUESTION_STATUSES } from '@/lib/compare/text';
import { DOCUMENT_KIND_LABEL } from '@/lib/documents/fields';
import { fallbackQuestions } from '@/lib/rules';
import { getSessionUserId, readSessionId } from '@/lib/session';

/**
 * ② 우려사항 → 중개사에게 물어볼 질문 (PRD §5.3 · §8.4)
 *
 * POST { propertyId?, concern } → { ok, questions[] }
 * POST { discrepancyId }          → { ok, questions[] }   (v2 — 문서 불일치, docs/API-V2.md §5-1)
 *
 * ★ R4: 실패해도 HTTP 200이고 **questions는 항상 비어 있지 않다.**
 *   AI가 죽으면 lib/rules.ts의 fallbackQuestions()가 키워드 매칭으로 질문 은행에서 골라준다.
 *   사용자 입장에서는 "AI가 만든 질문"이 "은행에서 고른 질문"으로 바뀔 뿐 흐름이 끊기지 않는다.
 *   ok:false는 "폴백을 썼다"는 신호이며, 프론트는 출처 배지를 AI 대신 규칙 기반으로 바꾸면 된다.
 *
 * ★ R3: "목록에 없는 고민"만 AI로 보낸다. 질문 은행으로 되는 것에는 AI를 쓰지 않는다.
 *
 * 생성된 질문을 매물에 저장하는 것은 이 라우트가 하지 않는다.
 * 사용자가 목록에서 고른 뒤 addQuestion Server Action으로 저장한다.
 */

export const dynamic = 'force-dynamic';

const MAX_CONCERN_LENGTH = 500;

type QuestionsResponse = {
  ok: boolean;
  questions: string[];
  /** 'ai' = 모델 생성 / 'template' = 규칙 폴백. 화면의 출처 배지에 쓴다 */
  source: 'ai' | 'template';
  reason?: string;
};

function template(concern: string, reason: string): NextResponse<QuestionsResponse> {
  return NextResponse.json({
    ok: false,
    questions: fallbackQuestions(concern),
    source: 'template' as const,
    reason,
  });
}

function reject(reason: string): QuestionsResponse {
  return { ok: false, questions: [], source: 'template', reason };
}

/**
 * 문서 불일치 한 행 → 확인 질문.
 *
 * ★ 모델에는 값(valueA·valueB)을 보내지 않는다. 항목 이름과 두 문서 이름만 — 성명·금액이 외부로
 *   나갈 이유가 없다. 질문은 "어느 쪽이 맞는지 확인"이 목적이라 값이 필요 없다.
 * ★ 소유권: 행 → 매물 → 세션. 남의 것이면 NOT_FOUND + 빈 질문.
 * ★ QUESTION_STATUSES(지금은 different)가 아닌 행은 {ok:false} + 빈 질문.
 * ★ R4: 모델이 실패하면 lib/rules.ts 템플릿 한 문장. questions는 비지 않는다.
 */
async function discrepancyQuestions(discrepancyId: string): Promise<NextResponse<QuestionsResponse>> {
  let row: { fieldKey: string; docA: DocumentKind; docB: DocumentKind; status: DiscrepancyStatus } | undefined;
  try {
    const userId = await getSessionUserId();
    [row] = await db
      .select({
        fieldKey: discrepancies.fieldKey,
        docA: discrepancies.docA,
        docB: discrepancies.docB,
        status: discrepancies.status,
      })
      .from(discrepancies)
      .innerJoin(properties, eq(properties.id, discrepancies.propertyId))
      .where(and(eq(discrepancies.id, discrepancyId), eq(properties.userId, userId)))
      .limit(1);
  } catch {
    return NextResponse.json(reject('지금 문서 차이를 읽을 수 없어요. 잠시 후 다시 시도해 주세요.'));
  }
  if (!row) return NextResponse.json(reject(NOT_FOUND));
  if (!QUESTION_STATUSES.includes(row.status)) {
    return NextResponse.json(reject('질문으로 바꾸는 항목이 아닙니다.'));
  }

  const pair = findPair(row.fieldKey, row.docA, row.docB);
  const fallback = discrepancyTemplateQuestion(row);
  if (!pair || !fallback) return NextResponse.json(reject('알 수 없는 대조 항목입니다.'));

  const field = pair.questionField ?? pair.label;
  const docA = DOCUMENT_KIND_LABEL[row.docA];
  const docB = DOCUMENT_KIND_LABEL[row.docB];
  const templateResponse = (reason: string) =>
    NextResponse.json({ ok: false, questions: [fallback], source: 'template' as const, reason });

  const docs = row.docA === row.docB ? `${docA} (한 문서 안의 두 표기)` : `${docA}, ${docB}`;
  const summary = `문서 차이 · ${row.fieldKey} · ${row.docA}/${row.docB}`;

  const result = await generate({
    system: DISCREPANCY_QUESTIONS_SYSTEM,
    user: wrapUserInput('문서 차이', `항목: ${field}\n문서: ${docs}`),
    json: true,
  });

  if (!result.ok) {
    await logAi('question_convert', summary, `실패: ${result.reason}`, result.reason === 'banned');
    return templateResponse('AI 변환에 실패해 템플릿 문장을 썼습니다.');
  }

  const parsed = parseJsonDetailed<unknown>(result.text);
  const questions = normalizeQuestions(parsed.value).slice(0, 2);
  await logAi(
    'question_convert',
    summary,
    parsed.recovered ? `${RECOVERY_MARK}\n${result.text}` : result.text,
    false,
  );

  if (questions.length === 0) return templateResponse('변환된 질문이 없어 템플릿 문장을 썼습니다.');
  return NextResponse.json({ ok: true as const, questions, source: 'ai' as const });
}

export async function POST(request: Request) {
  // 세션 없는 호출은 폴백도 주지 않고 거부한다.
  // proxy.ts는 /api/**에 쿠키를 발급하지 않으므로, 페이지를 거치지 않은 직접 호출이 걸러진다.
  const session = await readSessionId();
  if (!session) {
    return NextResponse.json({
      ok: false,
      questions: [],
      source: 'template' as const,
      reason: '세션이 없습니다.',
    });
  }

  let concern = '';
  let discrepancyId = '';
  try {
    const body = (await request.json()) as { concern?: unknown; discrepancyId?: unknown };
    concern = typeof body.concern === 'string' ? body.concern.trim() : '';
    discrepancyId = typeof body.discrepancyId === 'string' ? body.discrepancyId.trim() : '';
  } catch {
    return template('', '요청 본문을 읽지 못했습니다.');
  }

  // v2 — 문서 불일치 → 질문 (docs/API-V2.md §5-1). concern과 둘 중 하나만
  if (discrepancyId) {
    if (concern) return NextResponse.json(reject('걱정 내용과 문서 차이 중 하나만 보내 주세요.'));
    return discrepancyQuestions(discrepancyId);
  }

  if (!concern) return template('', '걱정되는 내용을 입력해주세요.');

  const clipped = concern.slice(0, MAX_CONCERN_LENGTH);

  const result = await generate({
    system: QUESTIONS_SYSTEM,
    user: wrapUserInput('걱정', clipped),
    json: true,
  });

  if (!result.ok) {
    await logAi('question_convert', clipped, `실패: ${result.reason}`, result.reason === 'banned');
    return template(clipped, 'AI 변환에 실패해 질문 은행에서 골랐습니다.');
  }

  const parsed = parseJsonDetailed<unknown>(result.text);
  const questions = normalizeQuestions(parsed.value);

  await logAi(
    'question_convert',
    clipped,
    parsed.recovered ? `${RECOVERY_MARK}\n${result.text}` : result.text,
    false,
  );

  // 형식은 맞았지만 쓸 만한 질문이 없으면 폴백이 낫다.
  if (questions.length === 0) {
    return template(clipped, '변환된 질문이 없어 질문 은행에서 골랐습니다.');
  }

  return NextResponse.json({
    ok: true as const,
    questions,
    source: 'ai' as const,
  });
}
