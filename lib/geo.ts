/**
 * 위치·거리 계산 (PRD v2.1 §4.2)
 *
 * ★ 직선거리(Haversine)만 계산한다. 실제 도보 경로는 지형·건물에 따라 다르므로
 *   화면에는 반드시 "직선거리 기준 추정"을 병기한다.
 * ★ 입지 평가·동네 점수 같은 판정성 계산은 이 파일에 두지 않는다.
 */

/**
 * 거리 계산 기준점.
 *
 * 출처: 카카오 로컬 API 조회, 2026-08-11.
 * 경산캠퍼스 대표 좌표(POI 중심)이며 정문 좌표가 아님. 추정값 아님.
 *
 * ★ 기준점이 캠퍼스 중심이므로 화면 문구도 "정문"이 아니라 "경산캠퍼스"로 쓴다.
 *   기준이 아닌 지점을 기준이라고 표기하면 사실과 다른 정보가 된다. (R8)
 */
export const SCHOOL_ORIGIN = {
  name: '대구대 경산캠퍼스',
  lat: 35.90203906952692,
  lng: 128.84884246650373,
} as const;

/** 평균 보행 속도 — 도보 시간 추정용 (m/분) */
const WALK_SPEED_M_PER_MIN = 67;

export function haversineMeters(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const R = 6371000; // 지구 반지름(m)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** 등록 시 1회 계산해 distance_from_school에 캐시 */
export function distanceFromSchool(lat: number | null, lng: number | null): number | null {
  if (lat == null || lng == null) return null;
  return haversineMeters(SCHOOL_ORIGIN.lat, SCHOOL_ORIGIN.lng, lat, lng);
}

export function formatDistance(meters: number | null): string {
  if (meters == null) return '위치 미지정';
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)}km`
    : `${meters}m`;
}

/** 반드시 "추정"임을 함께 표기할 것 */
export function estimateWalkMinutes(meters: number | null): number | null {
  if (meters == null) return null;
  return Math.max(1, Math.round(meters / WALK_SPEED_M_PER_MIN));
}

export function formatDistanceLabel(meters: number | null): string {
  if (meters == null) return '위치 미지정';
  return `${SCHOOL_ORIGIN.name}에서 직선 ${formatDistance(meters)} (도보 약 ${estimateWalkMinutes(meters)}분 · 직선거리 기준 추정)`;
}

export const DISTANCE_NOTICE =
  '직선거리 기준 추정값입니다. 실제 도보 경로는 지형·건물 배치에 따라 달라질 수 있습니다.';

/* ══════════════════════════════════════════════════════════════
   진행률 — 규칙 기반 집계 (점수화 아님)
   ══════════════════════════════════════════════════════════════ */
export function calcProgress(
  visitChecks: { result: string }[],
  questions: { answer: string; noAnswer: boolean }[],
): number {
  const total = visitChecks.length + questions.length;
  if (total === 0) return 0;
  const done =
    visitChecks.filter((v) => v.result !== '' && v.result !== 'na').length +
    questions.filter((q) => q.answer !== '' || q.noAnswer).length;
  return Math.round((done / total) * 100);
}
