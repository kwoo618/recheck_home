'use client';

import dynamic from 'next/dynamic';

import { formatDistance } from '@/lib/geo';
import { MAP_NOTICE, NO_LOCATION_TITLE } from './status-pin';
import type { PropertyMapProps } from './types';
// 색·테두리·간격을 화면과 같은 --rc- 토큰으로 쓴다. 지도만 다른 회색을 쓰면
// 같은 페이지 안에서 톤이 어긋난다. 이 패널이 지도 모듈의 유일한 진입점이라
// 여기서 한 번 불러오면 내부 컴포넌트까지 함께 적용된다.
import '../screens/recheck-theme.css';

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
        className="h-full w-full animate-pulse rounded-[14px] border border-[var(--rc-line)] bg-[var(--rc-paper)]"
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
      <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--rc-ink-faint)]">※ {MAP_NOTICE}</p>

      {unlocated.length > 0 && (
        <div className="mt-3 rounded-[10px] bg-[var(--rc-paper)] px-3.5 py-2.5">
          <p className="text-[12.5px] font-semibold text-[var(--rc-ink)]">
            {NO_LOCATION_TITLE} {unlocated.length}건
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--rc-ink-soft)]">
            주소로 좌표를 찾지 못한 매물입니다. 지도에는 표시되지 않지만 검증·비교·인쇄는 그대로
            이용할 수 있습니다.
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {unlocated.map((p) => (
              <li key={p.id} className="text-[12.5px] text-[var(--rc-ink-soft)]">
                {p.name}
                <span className="ml-1 text-[var(--rc-ink-faint)]">
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
