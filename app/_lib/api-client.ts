import type { CreatePropertyInput } from '@/lib/actions/properties';
import type { GeocodeFn } from '@/components/screens/_parts/property-fields';

/**
 * 브라우저에서 부르는 Route Handler 래퍼.
 *
 * Server Action은 클라이언트 컴포넌트가 직접 import 할 수 있지만,
 * Route Handler는 fetch가 필요하다. 화면이 fetch·JSON 파싱을 몰라도 되게 여기서 감싼다.
 *
 * ★ R4: 세 함수 모두 예외를 던지지 않는다. 실패는 null 또는 ok:false로 수렴한다.
 *   라우트가 이미 항상 HTTP 200을 주지만, 네트워크 자체가 끊기는 경우까지 여기서 흡수한다.
 */

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** 주소 → 좌표. 실패하면 null이고, 화면은 좌표 없이 저장을 이어간다. */
export const geocode: GeocodeFn = async (address) => {
  const json = await postJson<{ ok: boolean; lat: number | null; lng: number | null }>(
    '/api/geocode',
    { address },
  );

  if (!json?.ok || json.lat === null || json.lng === null) return null;
  return { lat: json.lat, lng: json.lng };
};

/** 붙여넣은 텍스트 → 구조화 초안. 실패하면 화면이 직접 입력 탭으로 넘긴다. */
export async function parseText(
  text: string,
): Promise<{ ok: boolean; data?: Partial<CreatePropertyInput> }> {
  const json = await postJson<{ ok: boolean; data?: Partial<CreatePropertyInput> }>(
    '/api/ai/parse',
    { text },
  );

  if (!json?.ok || !json.data) return { ok: false };
  return { ok: true, data: json.data };
}

/**
 * 조사 기록 차이 요약. 실패하면 화면은 비교 표만 그린다.
 * 요약은 표를 읽기 쉽게 거드는 것이지 표를 대체하지 않는다. (R4)
 */
export async function summarize(
  propertyIds: string[],
): Promise<{ ok: boolean; summary?: string }> {
  const json = await postJson<{ ok: boolean; summary?: string }>('/api/ai/summary', {
    propertyIds,
  });

  if (!json?.ok || !json.summary) return { ok: false };
  return { ok: true, summary: json.summary };
}

/**
 * 우려사항 → 질문. 서버가 실패해도 템플릿 폴백으로 questions를 채워 보낸다.
 * ok=false는 "AI가 아니라 질문 은행에서 골랐다"는 신호이므로 화면이 출처 배지를 바꾼다.
 */
export async function askQuestions(
  propertyId: string,
  concern: string,
): Promise<{ ok: boolean; questions: string[] }> {
  const json = await postJson<{ ok: boolean; questions?: string[] }>('/api/ai/questions', {
    propertyId,
    concern,
  });

  return { ok: Boolean(json?.ok), questions: json?.questions ?? [] };
}
