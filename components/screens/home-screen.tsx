import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatDistanceLabel } from '@/lib/geo';
import type { PropertyDTO } from '@/lib/types';
import { ScreenShell } from './_parts/screen-shell';
import { HomeMapList } from './_parts/home-map-list';
import { ProgressRing } from './_parts/progress-ring';
import { formatSpecLine } from './_parts/format';
import { isActive, statusInfo } from './_parts/status';
import type { HrefFor } from './_parts/nav';

/**
 * 홈 — 내 매물 목록 (프로토타입 viewDash)
 *
 * ★ 데이터는 전부 props. 이 컴포넌트는 DB·Server Action·fetch 를 부르지 않는다.
 * ★ progress 는 서버 계산값(PropertyDTO.progress)을 그대로 그린다.
 * ★ 정렬하지 않는다. 거리·가격순으로 줄을 세우면 그 자체가 순위 표시가 된다.
 *   좌표를 얻지 못한 매물만 "위치 미지정"으로 분리한다 (지도에 핀이 없는 매물).
 */
export type HomeScreenProps = {
  properties: PropertyDTO[];
  hrefFor: HrefFor;
  /**
   * 지도 패널 (`<PropertyMapPanel properties={toMapProperties(properties)} />`).
   * 주지 않으면 리스트만 그린다 — 지도 로딩 실패 폴백과 같은 경로다. (R4)
   *
   * 하단 고정 문구("등록한 매물만 표시됩니다…")와 좌표 없는 매물 안내는
   * 패널이 직접 렌더하므로 여기서 다시 쓰지 않는다.
   */
  map?: ReactNode;
};

export function HomeScreen({ properties, hrefFor, map }: HomeScreenProps) {
  const total = properties.length;
  const activeCount = properties.filter((p) => isActive(p.status)).length;
  const located = properties.filter((p) => p.distanceFromSchool !== null);
  const unlocated = properties.filter((p) => p.distanceFromSchool === null);

  const list = (
    <>
      {located.map((p) => (
        <PropertyCard key={p.id} property={p} hrefFor={hrefFor} />
      ))}

      {unlocated.length > 0 && (
        <>
          <h3 className="rc-group-label">위치 미지정 {unlocated.length}개</h3>
          {/* 지도를 함께 쓸 때는 같은 설명이 지도 패널 아래에도 나온다 — 한 번만 보여준다 */}
          {!map && (
            <p className="rc-notice">
              좌표를 얻지 못해 지도에 표시되지 않는 매물이에요. 확인·비교·인쇄는 그대로 됩니다.
            </p>
          )}
          {unlocated.map((p) => (
            <PropertyCard key={p.id} property={p} hrefFor={hrefFor} />
          ))}
        </>
      )}
    </>
  );

  return (
    <ScreenShell hrefFor={hrefFor}>
      <div className="rc-home-head">
        <div>
          <h2 className="rc-h2">내 매물</h2>
          <p className="rc-home-count">
            {total === 0
              ? ''
              : activeCount >= 2
                ? `검토 중 ${activeCount}개 — 비교 모드를 쓸 수 있어요`
                : `${total}개 등록됨`}
          </p>
        </div>
        <div className="rc-home-actions">
          {activeCount >= 2 && (
            <Link href={hrefFor('compare')} className="rc-btn">
              매물 비교
            </Link>
          )}
          {total > 0 && (
            <Link href={hrefFor('add')} className="rc-btn rc-btn-primary">
              + 매물 추가
            </Link>
          )}
        </div>
      </div>

      {total === 0 ? (
        <div className="rc-empty">
          <b>방 보러 가기 전에, 조사지부터 만들어요</b>
          직방·다방에서 찾은 매물을 등록하면
          <br />
          현장에서 확인할 것·물어볼 것을 정리해 드립니다.
          <div style={{ marginTop: 16 }}>
            <Link href={hrefFor('add')} className="rc-btn rc-btn-primary">
              첫 매물 등록
            </Link>
          </div>
        </div>
      ) : map ? (
        <HomeMapList map={map}>{list}</HomeMapList>
      ) : (
        <div className="rc-home-body">
          <div className="rc-home-list">{list}</div>
        </div>
      )}
    </ScreenShell>
  );
}

function PropertyCard({ property: p, hrefFor }: { property: PropertyDTO; hrefFor: HrefFor }) {
  const { label, className, action, route } = statusInfo(p.status);
  const href = hrefFor(route, p.id);

  return (
    <article className="rc-card rc-prop-card">
      <ProgressRing percent={p.progress} />
      <div className="rc-prop-info">
        <Link href={href} className="rc-prop-name">
          {p.name}
        </Link>
        <p className="rc-prop-meta">{formatSpecLine(p)}</p>
        {/* 문구를 직접 조립하지 않는다 — 기준점 이름과 "직선거리 기준 추정" 병기가 lib/geo 한 곳에 있다 */}
        <p className="rc-prop-dist">📍 {formatDistanceLabel(p.distanceFromSchool)}</p>
      </div>
      <div className="rc-prop-actions">
        <span className={`rc-status-tag ${className}`}>{label}</span>
        <Link
          href={href}
          className={`rc-btn rc-btn-sm ${p.status === 'excluded' ? 'rc-btn-ghost' : 'rc-btn-primary'}`}
        >
          {action}
        </Link>
      </div>
    </article>
  );
}
