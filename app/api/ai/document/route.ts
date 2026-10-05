import { NextResponse } from 'next/server';

import { generate, logAi } from '@/lib/ai/gemini';
import { parseJsonDetailed, RECOVERY_MARK } from '@/lib/ai/normalize';
import { documentSystemFor, wrapUserInput } from '@/lib/ai/prompts';
import { findOwnedProperty, NOT_FOUND } from '@/lib/actions/_shared';
import { isDocumentKind } from '@/lib/documents/fields';
import { maskPersonalIds } from '@/lib/documents/mask';
import {
  hasAnyValue,
  normalizeDocumentFields,
  redactFieldsForLog,
  type ExtractedField,
} from '@/lib/documents/structure';
import { readSessionId } from '@/lib/session';

/**
 * ④ 문서 구조화 (V2-PLAN §3 · §4-1 · docs/API-V2.md §2)
 *
 * POST { propertyId, kind, text } → { ok: true, fields } | { ok: false, reason }
 *
 * ★ R4: 실패·타임아웃이어도 HTTP 200 + {ok:false}. 화면은 모든 칸이 빈 확인 화면(수기 입력)으로 간다.
 * ★ R9: text는 pdf.js 텍스트 레이어 추출 결과(클라이언트가 마스킹함). 이 라우트는 모델 호출 전에
 *   같은 마스킹을 한 번 더 하고, text를 DB에 저장하지 않는다. ai_logs에도 원문을 넣지 않는다.
 * ★ R8: 못 찾으면 null. 원문에 없는 값은 normalizeDocumentFields가 버린다.
 * ★ 결과를 저장하지 않는다. 사용자가 확인 화면에서 검토·수정한 뒤 saveDocument로 저장한다.
 *
 * 광고(ad)는 이 지점을 쓰지 않는다 — 이미지는 수기 입력, 광고 문구는 ① 붙여넣기 흐름.
 * 글자 수 상한은 실제 문서로 실측한 뒤 정한다(docs/API-V2.md §0-1). 지금은 두지 않는다.
 */

export const dynamic = 'force-dynamic';

type DocumentStructureResponse =
  | { ok: true; fields: ExtractedField[] }
  | { ok: false; reason: string };

const FALLBACK = '자동으로 읽지 못했습니다. 직접 입력해 주세요.';

function fail(reason: string): NextResponse<DocumentStructureResponse> {
  return NextResponse.json({ ok: false as const, reason });
}

export async function POST(request: Request) {
  const session = await readSessionId();
  if (!session) return fail('세션이 없습니다.');

  let propertyId = '';
  let kind: unknown;
  let input = '';
  try {
    const body = (await request.json()) as { propertyId?: unknown; kind?: unknown; text?: unknown };
    propertyId = typeof body.propertyId === 'string' ? body.propertyId : '';
    kind = body.kind;
    input = typeof body.text === 'string' ? body.text.trim() : '';
  } catch {
    return fail('요청 본문을 읽지 못했습니다.');
  }

  if (!isDocumentKind(kind)) return fail('문서 종류가 올바르지 않습니다.');
  const system = documentSystemFor(kind);
  if (!system) return fail('광고는 자동 구조화 대상이 아닙니다. 직접 입력해 주세요.');
  if (!input) return fail('읽어온 텍스트가 없습니다. 직접 입력해 주세요.');

  try {
    if (!(await findOwnedProperty(propertyId))) return fail(NOT_FOUND);
  } catch {
    return fail(FALLBACK);
  }

  // 이중 장치 — 클라이언트가 이미 가렸어도 한 번 더 (docs/API-V2.md §2 "마스킹")
  const { text } = maskPersonalIds(input);
  const logInput = `${kind} · ${text.length}자`;

  const result = await generate({
    system,
    user: wrapUserInput('문서텍스트', text),
    json: true,
  });

  if (!result.ok) {
    await logAi('document_structure', logInput, `실패: ${result.reason}`, result.reason === 'banned');
    return fail(FALLBACK);
  }

  const parsed = parseJsonDetailed<unknown>(result.text);
  const fields = normalizeDocumentFields(parsed.value, kind, text);

  // 모델 원문 응답에는 성명이 들어 있다 — 정규화 후 성명·호수·특약 값을 가린 것만 남긴다
  const logged = redactFieldsForLog(fields);
  await logAi(
    'document_structure',
    logInput,
    parsed.recovered ? `${RECOVERY_MARK}\n${logged}` : logged,
    false,
  );

  if (!hasAnyValue(fields)) return fail(FALLBACK);

  return NextResponse.json({ ok: true as const, fields });
}
