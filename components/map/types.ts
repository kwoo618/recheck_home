import type { PropertyStatus } from '@/db/schema';

/**
 * 지도가 필요로 하는 최소 필드.
 *
 * PropertyDTO를 그대로 넘겨도 되도록 구조적 부분집합으로 정의했다.
 * 지도는 가격·면적·연식을 알 필요가 없다 — 알면 색이나 크기로 반영하고 싶어지는데
 * 그건 판정에 해당한다. (R1)
 */
export type MapProperty = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  /** 대구대 경산캠퍼스 기준 직선거리(m). null이면 "위치 미지정" */
  distanceFromSchool: number | null;
  status: PropertyStatus;
};

/**
 * 지도에 넘길 필드만 남긴다.
 *
 * ★ 반드시 **서버 컴포넌트에서** 호출할 것.
 *   지도는 클라이언트 컴포넌트라, 넘긴 props가 통째로 RSC 페이로드에 직렬화돼
 *   페이지 HTML에 실린다. PropertyDTO를 그대로 넘기면 addressDetail(동/호수)과
 *   visitChecks·questions 전체가 함께 실린다.
 *   지도는 그 값들을 쓰지 않으므로 보낼 이유가 없다. (R7 · 페이로드 절감)
 *
 *   const mapProperties = toMapProperties(properties);   // page.tsx (서버)
 *   <PropertyMapPanel properties={mapProperties} />
 */
export function toMapProperties(properties: MapProperty[]): MapProperty[] {
  return properties.map(({ id, name, latitude, longitude, distanceFromSchool, status }) => ({
    id,
    name,
    latitude,
    longitude,
    distanceFromSchool,
    status,
  }));
}

export type PropertyMapProps = {
  properties: MapProperty[];
  /** 강조할 매물. 카드 hover·선택과 연동할 때 쓴다 */
  selectedId?: string | null;
  /** 핀을 눌렀을 때. 넘기지 않으면 핀은 표시만 하고 반응하지 않는다 */
  onSelect?: (id: string) => void;
  /** 지도 영역 높이. 기본 320px */
  height?: number | string;
  className?: string;
};
