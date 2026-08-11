import { NextResponse } from 'next/server';

import { generate, logAi } from '@/lib/ai/gemini';
import { normalizeParsed, parseJson, type ParsedProperty } from '@/lib/ai/normalize';
import { PARSE_SYSTEM, wrapUserInput } from '@/lib/ai/prompts';
import { readSessionId } from '@/lib/session';

/**
 * ① 붙여넣은 매물 텍스트 → 구조화 (PRD §5.1-2 · §8.4)
 *
 * POST { text } → { ok: true, data } | { ok: false, reason }
 *
 * ★ R4: 실패해도 HTTP 200. 프론트는 ok:false면 수기 입력 탭으로 전환하면 된다.
 * ★ R3: 자유 텍스트 이해가 꼭 필요한 지점이라 AI를 쓴다.
 * ★ 결과는 "초안"이다. 사용자가 정보 확인 화면에서 전 필드를 검토·수정한 뒤에야 저장된다.
 *   자동 취득 정보는 틀릴 수 있다는 전제가 서비스 설계에 이미 들어 있다 (PRD §5.2).
 *
 * 크롤링이 아니다 — 사용자가 자기 화면에서 직접 복사해 붙여넣은 텍스트만 받는다.
 */

export const dynamic = 'force-dynamic';

const MAX_INPUT_LENGTH = 4000;

type ParseResponse =
  | { ok: true; data: ParsedProperty }
  | { ok: false; reason: string };

function fail(reason: string): NextResponse<ParseResponse> {
  return NextResponse.json({ ok: false as const, reason });
}

export async function POST(request: Request) {
  const session = await readSessionId();
  if (!session) return fail('세션이 없습니다.');

  let input = '';
  try {
    const body = (await request.json()) as { text?: unknown };
    input = typeof body.text === 'string' ? body.text.trim() : '';
  } catch {
    return fail('요청 본문을 읽지 못했습니다.');
  }

  if (!input) return fail('붙여넣은 내용이 없습니다.');

  const clipped = input.slice(0, MAX_INPUT_LENGTH);

  const result = await generate({
    system: PARSE_SYSTEM,
    user: wrapUserInput('매물설명', clipped),
    json: true,
  });

  if (!result.ok) {
    await logAi('parse', clipped, `실패: ${result.reason}`, result.reason === 'banned');
    // 폴백은 프론트가 그린다 — 수기 입력 탭으로 전환.
    return fail('구조화에 실패했습니다. 직접 입력해주세요.');
  }

  const data = normalizeParsed(parseJson(result.text));

  await logAi('parse', clipped, result.text, false);

  // 아는 필드를 하나도 못 뽑았으면 성공이라 할 수 없다.
  if (Object.keys(data).length === 0) {
    return fail('인식된 항목이 없습니다. 직접 입력해주세요.');
  }

  return NextResponse.json({ ok: true as const, data });
}
