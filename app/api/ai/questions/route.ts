import { NextResponse } from 'next/server';

import { generate, logAi } from '@/lib/ai/gemini';
import { normalizeQuestions, parseJson } from '@/lib/ai/normalize';
import { QUESTIONS_SYSTEM, wrapUserInput } from '@/lib/ai/prompts';
import { fallbackQuestions } from '@/lib/rules';
import { readSessionId } from '@/lib/session';

/**
 * ② 우려사항 → 중개사에게 물어볼 질문 (PRD §5.3 · §8.4)
 *
 * POST { propertyId?, concern } → { ok, questions[] }
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
  try {
    const body = (await request.json()) as { concern?: unknown };
    concern = typeof body.concern === 'string' ? body.concern.trim() : '';
  } catch {
    return template('', '요청 본문을 읽지 못했습니다.');
  }

  if (!concern) return template('', '걱정되는 내용을 입력해주세요.');

  const clipped = concern.slice(0, MAX_CONCERN_LENGTH);

  const result = await generate({
    system: QUESTIONS_SYSTEM,
    user: wrapUserInput('걱정', clipped),
    json: true,
  });

  if (!result.ok) {
    await logAi('questions', clipped, `실패: ${result.reason}`, result.reason === 'banned');
    return template(clipped, 'AI 변환에 실패해 질문 은행에서 골랐습니다.');
  }

  const questions = normalizeQuestions(parseJson(result.text));

  await logAi('questions', clipped, result.text, false);

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
