'use client';

import dynamic from 'next/dynamic';

import { formatDistance } from '@/lib/geo';
import { MAP_NOTICE, NO_LOCATION_TITLE } from './status-pin';
import type { PropertyMapProps } from './types';

/**
 * 지도 패널 — 프론트 화면이 쓰는 **유일한 진입점**.
 *
 * 카카오맵 SDK는 브라우저 전용이므로 서버에서 렌더할 수 없다.
 * next/dynamic + ssr:false로 감싸고, 그 사이에는 스켈레톤을 보여준다. (PRD §4.3)
 *
 * 이 패널이 함께 책임지는 것:
 *   · 하단 고정 문구 — 지도가 떴든 폴백 리스트든 **항상** 노출한다
 *   · 좌표가 없는 매물의 별도 안내 (PRD §5.6①)
 *
 * 사용:
 *   <PropertyMapPanel properties={properties} />
 *   <PropertyMapPanel properties={properties} selectedId={id} onSelect={setId} height={420} />
 */
const PropertyMap = dynamic(
  () => import('./PropertyMap').then((m) => m.PropertyMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-full w-full animate-pulse rounded-lg border border-neutral-200 bg-neutral-100"
        role="status"
        aria-label="지도를 불러오는 중"
      />
    ),
  },
);

export function PropertyMapPanel({
  properties,
  selectedId = null,
  onSelect,
  height = 320,
  className,
}: PropertyMapProps) {
  const unlocated = properties.filter((p) => p.latitude === null || p.longitude === null);

  return (
    <section className={className} aria-label="내 매물 지도">
      <PropertyMap
        properties={properties}
        selectedId={selectedId}
        onSelect={onSelect}
        height={height}
      />

      {/*
        지도 하단 고정 문구 — CLAUDE.md UI 규약.
        "이 지도는 추천 서비스가 아니다"를 계속 상기시키는 장치라 조건 없이 렌더한다.
      */}
      <p className="mt-2 text-xs leading-relaxed text-neutral-500">※ {MAP_NOTICE}</p>

      {unlocated.length > 0 && (
        <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs font-medium text-neutral-700">
            {NO_LOCATION_TITLE} {unlocated.length}건
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            주소로 좌표를 찾지 못한 매물입니다. 지도에는 표시되지 않지만 검증·비교·인쇄는 그대로
            이용할 수 있습니다.
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {unlocated.map((p) => (
              <li key={p.id} className="text-xs text-neutral-600">
                {p.name}
                <span className="ml-1 text-neutral-400">
                  {formatDistance(p.distanceFromSchool)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default PropertyMapPanel;
