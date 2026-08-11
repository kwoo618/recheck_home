'use client';

import { useState, type ReactNode } from 'react';

/**
 * 홈의 지도·목록 배치 (PRD §7.1 데스크톱 분할 / §7.2 모바일 탭 전환)
 *
 * ★ 좁은 화면에서는 지도와 목록을 동시에 보여줄 자리가 없다. 탭으로 전환한다.
 *   넓은 화면(1024px~)에서는 탭을 숨기고 좌·우로 나란히 둔다.
 * ★ 지도 자체는 props(ReactNode)로 받는다. 이 컴포넌트는 카카오 SDK를 모른다.
 *   지도가 폴백 리스트로 대체돼도 여기서는 달라질 게 없다. (R4)
 */
export function HomeMapList({ map, children }: { map: ReactNode; children: ReactNode }) {
  const [tab, setTab] = useState<'map' | 'list'>('map');

  return (
    <>
      <div className="rc-home-tabs" role="tablist" aria-label="지도·목록 전환">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'map'}
          className={tab === 'map' ? 'rc-on' : ''}
          onClick={() => setTab('map')}
        >
          지도
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'list'}
          className={tab === 'list' ? 'rc-on' : ''}
          onClick={() => setTab('list')}
        >
          목록
        </button>
      </div>

      <div className="rc-home-body rc-has-map" data-tab={tab}>
        <aside className="rc-home-map">{map}</aside>
        <div className="rc-home-list">{children}</div>
      </div>
    </>
  );
}
