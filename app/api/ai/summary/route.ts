import { NextResponse } from 'next/server';

import { generate, logAi } from '@/lib/ai/gemini';
import { SUMMARY_SYSTEM, wrapUserInput } from '@/lib/ai/prompts';
import { listProperties } from '@/lib/actions/properties';
import { readSessionId } from '@/lib/session';
import type { PropertyDTO } from '@/lib/types';

/**
 * ③ 조사 기록 차이 요약 (PRD §5.6-④ · §8.4)
 *
 * POST { propertyIds[] } → { ok: true, summary } | { ok: false, reason }
 *
 * ★ R4: 실패해도 HTTP 200. 실패하면 프론트는 **비교 표만** 그린다.
 *   요약은 표를 읽기 쉽게 거드는 것이지 표를 대체하지 않는다. 없어도 비교는 성립한다.
 * ★ R1: 여기가 판정성 표현이 가장 새기 쉬운 지점이다("A가 더 낫다").
 *   프롬프트 금지 지시 + containsBanned() 필터의 이중 장치로 막고,
 *   걸리면 요약 없이 표만 보여준다.
 *
 * 요약 대상은 **기록된 사실**이다. 가격·면적 같은 스펙 비교는 표가 이미 보여주므로 넣지 않는다.
 */

export const dynamic = 'force-dynamic';

type SummaryResponse =
  | { ok: true; summary: string }
  | { ok: false; reason: string };

function fail(reason: string): NextResponse<SummaryResponse> {
  return NextResponse.json({ ok: false as const, reason });
}

/** 모델에 넘길 최소 정보 — 기록된 것과 확인되지 않은 것 */
function digest(p: PropertyDTO) {
  return {
    이름: p.name,
    거래유형: p.dealType,
    확인한것: p.visitChecks
      .filter((v) => v.result !== '' && v.result !== 'na')
      .map((v) => {
        const label = { good: '좋음', ok: '보통', bad: '문제있음' }[v.result as 'good' | 'ok' | 'bad'];
        return `${v.title}: ${label}${v.memo ? ` (${v.memo})` : ''}`;
      }),
    받은답변: p.questions
      .filter((q) => q.answer !== '')
      .map((q) => `${q.text} → ${q.answer}`),
    미확인: [
      ...p.visitChecks.filter((v) => v.result === '' || v.result === 'na').map((v) => v.title),
      ...p.questions.filter((q) => q.answer === '').map((q) => q.text),
    ],
  };
}

export async function POST(request: Request) {
  const session = await readSessionId();
  if (!session) return fail('세션이 없습니다.');

  let ids: string[] = [];
  try {
    const body = (await request.json()) as { propertyIds?: unknown };
    ids = Array.isArray(body.propertyIds)
      ? body.propertyIds.filter((v): v is string => typeof v === 'string')
      : [];
  } catch {
    return fail('요청 본문을 읽지 못했습니다.');
  }

  if (ids.length < 2) return fail('비교할 매물을 2건 이상 선택해주세요.');

  // listProperties가 세션 소유권을 이미 강제한다 — 남의 매물 id를 넣어도 걸러진다.
  const mine = await listProperties();
  const targets = mine.filter((p) => ids.includes(p.id));

  if (targets.length < 2) return fail('비교할 매물을 찾지 못했습니다.');

  const digests = targets.map(digest);

  // 기록이 하나도 없으면 요약할 "차이"가 없다. 표만 보여주는 편이 정직하다.
  const hasRecord = digests.some((d) => d.확인한것.length > 0 || d.받은답변.length > 0);
  if (!hasRecord) return fail('아직 기록된 조사 결과가 없습니다.');

  const payload = JSON.stringify(digests, null, 1);
  const inputSummary = targets.map((p) => p.name).join(' / ');

  const result = await generate({
    system: SUMMARY_SYSTEM,
    user: wrapUserInput('조사기록', payload),
  });

  if (!result.ok) {
    await logAi('summary', inputSummary, `실패: ${result.reason}`, result.reason === 'banned');
    return fail('요약을 만들지 못했습니다. 아래 표를 확인해주세요.');
  }

  await logAi('summary', inputSummary, result.text, false);

  return NextResponse.json({ ok: true as const, summary: result.text });
}
