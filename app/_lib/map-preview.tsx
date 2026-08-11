'use client';

import type { ReactNode } from 'react';
import { PropertyMapPanel } from '@/components/map';
import { distanceFromSchool } from '@/lib/geo';

/**
 * 주소를 고른 직후 보여주는 지도 미리보기 (PRD §7.3).
 *
 * PropertyFields의 renderMapPreview 슬롯에 그대로 넘긴다.
 * 아직 저장되지 않은 좌표라 매물 id가 없으므로 'preview'를 임시로 쓴다 —
 * 지도는 id를 키로만 쓰고 서버에 보내지 않는다.
 *
 * 거리는 여기서 다시 계산한다. 등록 전이라 서버가 캐시해 둔 distance_from_school이 없다.
 * 같은 순수 함수를 쓰므로 저장 후 값과 어긋나지 않는다.
 */
export function renderMapPreview(coords: { latitude: number; longitude: number }): ReactNode {
  return (
    <PropertyMapPanel
      properties={[
        {
          id: 'preview',
          name: '선택한 위치',
          latitude: coords.latitude,
          longitude: coords.longitude,
          distanceFromSchool: distanceFromSchool(coords.latitude, coords.longitude),
          status: 'prep',
        },
      ]}
      height={200}
    />
  );
}
