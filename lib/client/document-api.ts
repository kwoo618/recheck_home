'use client';

import type { DocumentKind } from '@/db/schema';
import { maskPersonalIds } from '@/lib/documents/mask';
import type { ExtractedField } from '@/lib/documents/structure';

/**
 * 지점 ④ 호출 래퍼 — 브라우저 → POST /api/ai/document (docs/API-V2.md §0-1 · §2)
 *
 * 한 곳에서 책임지는 것:
 *   · 전송 전 마스킹 (주민번호·생년월일). 서버도 한 번 더 한다
 *   · 본문 크기 확인 — Vercel 함수 본문 상한(4.5MB)을 넘으면 413이 오고 라우트 코드가 돌지 않는다.
 *     보내기 전에 걸러 {ok:false}로 수렴시킨다. 413이 와도 같은 폴백
 *   · 네트워크 실패·비정상 응답 → {ok:false}. 예외를 던지지 않는다 (R4)
 *
 * ★ 원본(Blob)은 보내지 않는다. 텍스트 레이어에서 뽑은 문자열만 간다 (R9).
 */

/** Vercel 함수 요청 본문 상한 [문서 확인 — V2-TECH-REVIEW §5-1]. 4.5MB를 10진 바이트로 */
const FUNCTION_BODY_LIMIT_BYTES = 4_500_000;

export type StructureResult =
  | { ok: true; fields: ExtractedField[]; masked: number }
  | { ok: false; reason: string };

const FALLBACK = '자동으로 읽지 못했습니다. 직접 입력해 주세요.';

export async function structureDocument(
  propertyId: string,
  kind: DocumentKind,
  text: string,
): Promise<StructureResult> {
  const { text: maskedText, masked } = maskPersonalIds(text);
  const body = JSON.stringify({ propertyId, kind, text: maskedText });

  if (new Blob([body]).size > FUNCTION_BODY_LIMIT_BYTES) {
    return { ok: false, reason: '문서가 너무 커서 자동으로 읽을 수 없습니다. 직접 입력해 주세요.' };
  }

  try {
    const res = await fetch('/api/ai/document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (res.status === 413) {
      return { ok: false, reason: '문서가 너무 커서 자동으로 읽을 수 없습니다. 직접 입력해 주세요.' };
    }
    if (!res.ok) return { ok: false, reason: FALLBACK };

    const json = (await res.json()) as { ok?: boolean; fields?: ExtractedField[]; reason?: string };
    if (!json.ok || !Array.isArray(json.fields)) {
      return { ok: false, reason: typeof json.reason === 'string' ? json.reason : FALLBACK };
    }
    return { ok: true, fields: json.fields, masked };
  } catch {
    return { ok: false, reason: FALLBACK };
  }
}
