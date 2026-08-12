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
          {/* 빈 문자열을 렌더하면 <p>가 자리를 차지한 채 남는다 — 요소째 빼야 한다 */}
          {total > 0 && (
            <p className="rc-home-count">
              {activeCount >= 2
                ? `검토 중 ${activeCount}개 — 비교 모드를 쓸 수 있어요`
                : `${total}개 등록됨`}
            </p>
          )}
        </div>
        <div className="rc-home-actions">
          {activeCount >= 2 && (
            <Link href={hrefFor('compare')} className="rc-btn">
              매물 비교
            </Link>
          )}
          {/* 빈 상태에서도 남긴다 — 큰 안내 카드와 헤더 중 어디를 눌러도 같은 곳으로 간다 */}
          <Link href={hrefFor('add')} className="rc-btn rc-btn-primary">
            + 매물 추가
          </Link>
        </div>
      </div>

      {/*
        로그인이 없다. proxy.ts 가 발급한 익명 UUID 쿠키(rc_session)로 사용자를 구분하고,
        매물 자체는 서버 DB에 있다. 쿠키가 사라지면 데이터가 지워지는 것이 아니라 "찾아갈 열쇠"가
        없어지는 것이라, 문구를 "브라우저에 저장된다"로 쓰면 사실과 다르다. (R8)
        팀원 테스트 중 "매물이 사라졌어요"의 거의 유일한 원인이라 홈에 상시 노출한다.
      */}
      <p className="rc-notice">
        매물은 서버에 저장되지만, 로그인이 없어 <b>이 브라우저의 접속 정보(쿠키)</b>로 내 매물을
        구분합니다. 쿠키·사이트 데이터를 지우거나 다른 브라우저·기기·시크릿 창으로 열면 등록한 매물이
        보이지 않습니다.
      </p>

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
      {/*
        제외한 매물은 되살릴 수 있는데(excluded → prep) 그 길이 정보 확인 화면 안에 숨어 있다.
        카드에서 어디로 가는지 미리 알려준다.
      */}
      {p.status === 'excluded' && (
        <p className="rc-prop-hint">
          정보를 확인하고 저장하면 다시 검토 목록으로 돌아와요.
        </p>
      )}
    </article>
  );
}
