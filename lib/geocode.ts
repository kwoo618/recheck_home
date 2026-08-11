import 'server-only';

/**
 * 주소 → 좌표 변환 (카카오 로컬 API 프록시)
 *
 * ★ R6: KAKAO_REST_KEY는 서버 전용. 클라이언트에서 이 모듈을 임포트할 수 없다.
 * ★ R4: 실패는 예외가 아니라 null이다. 좌표를 못 얻어도 매물 등록은 성공해야 한다.
 *   → 호출부는 결과가 null이어도 그대로 진행하고, 화면은 "위치 미지정"으로 처리한다.
 *
 * ⚠ 확인 필요 (R8): 카카오 로컬 API의 무료 사용 한도·상업적 이용 조건·쿼터 정책은
 *   본 코드 작성 시점 기준으로 검증되지 않았습니다. 카카오 개발자 콘솔에서
 *   직접 확인한 뒤 필요하면 호출 빈도 제한을 추가하세요.
 *   (엔드포인트: https://dapi.kakao.com/v2/local/search/address.json)
 */

const KAKAO_ADDRESS_API = 'https://dapi.kakao.com/v2/local/search/address.json';

/** 외부 API가 느릴 때 등록 흐름을 붙잡지 않도록 하는 상한 */
const TIMEOUT_MS = 5000;

export type Coords = { latitude: number; longitude: number };

export async function geocodeAddress(address: string): Promise<Coords | null> {
  const key = process.env.KAKAO_REST_KEY;

  if (!key || !address.trim()) return null;

  try {
    const res = await fetch(
      `${KAKAO_ADDRESS_API}?query=${encodeURIComponent(address)}&size=1`,
      {
        headers: { Authorization: `KakaoAK ${key}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      },
    );

    if (!res.ok) return null;

    const json = (await res.json()) as {
      documents?: { x?: string; y?: string }[];
    };

    const doc = json.documents?.[0];
    if (!doc?.x || !doc?.y) return null;

    // 카카오 응답은 x=경도, y=위도 (문자열)
    const longitude = Number(doc.x);
    const latitude = Number(doc.y);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return { latitude, longitude };
  } catch {
    // 네트워크 오류·타임아웃·JSON 파싱 실패 — 전부 "좌표 없음"으로 수렴시킨다.
    return null;
  }
}
