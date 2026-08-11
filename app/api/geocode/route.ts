import { NextResponse } from 'next/server';

import { geocodeAddress } from '@/lib/geocode';
import { readSessionId } from '@/lib/session';

/**
 * 주소 → 좌표 프록시 (PRD v2.1 §8.4)
 *
 * POST { address } → { ok: true, lat, lng } | { ok: false, lat: null, lng: null }
 *
 * ★ R4: 실패해도 항상 HTTP 200. 상태 코드가 아니라 본문의 ok로 판정한다.
 *   프론트는 try/catch 없이 ok만 보고 "위치 미지정"으로 처리하면 된다.
 * ★ R6: 카카오 REST 키는 이 서버 라우트 안에서만 쓰인다.
 *
 * ★ 필드명은 API 계약(PRD §8.4)의 { lat, lng }를 따른다.
 *   lib/geocode.ts는 DB 컬럼과 맞춘 { latitude, longitude }를 돌려주므로 여기서 변환한다.
 *   계약이 우선이고, 변환은 경계에서 한 번만 한다.
 */

export const dynamic = 'force-dynamic';

/** 주소 문자열 상한 — 이보다 긴 입력은 주소가 아니다 */
const MAX_ADDRESS_LENGTH = 200;

type GeocodeResponse =
  | { ok: true; lat: number; lng: number }
  | { ok: false; lat: null; lng: null; reason: string };

function fail(reason: string): NextResponse<GeocodeResponse> {
  // lat/lng를 null로 함께 내려 프론트가 구조분해해도 undefined가 되지 않게 한다.
  return NextResponse.json({ ok: false as const, lat: null, lng: null, reason });
}

export async function POST(request: Request) {
  // 우리 키로 외부 API를 호출하는 라우트다. 세션 없는 호출까지 받아줄 이유가 없다.
  // (proxy.ts가 모든 요청에 세션 쿠키를 발급하므로 정상 사용자는 항상 통과한다)
  const session = await readSessionId();
  if (!session) return fail('세션이 없습니다.');

  let address = '';
  try {
    const body = (await request.json()) as { address?: unknown };
    address = typeof body.address === 'string' ? body.address.trim() : '';
  } catch {
    return fail('요청 본문을 읽지 못했습니다.');
  }

  if (!address) return fail('주소가 비어 있습니다.');
  if (address.length > MAX_ADDRESS_LENGTH) return fail('주소가 너무 깁니다.');

  // geocodeAddress는 예외를 던지지 않고 null로 수렴한다.
  const coords = await geocodeAddress(address);
  if (!coords) return fail('좌표를 찾지 못했습니다.');

  return NextResponse.json({
    ok: true as const,
    lat: coords.latitude,
    lng: coords.longitude,
  });
}
