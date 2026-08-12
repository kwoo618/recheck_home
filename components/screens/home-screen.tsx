import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatDistanceLabel } from '@/lib/geo';
import type { ActionResult, PropertyDTO } from '@/lib/types';
import { ScreenShell } from './_parts/screen-shell';
import { HomeMapList } from './_parts/home-map-list';
import { HomeLanding } from './_parts/home-landing';
import { SessionReset } from './_parts/session-reset';
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
  /**
   * rc_session 쿠키를 새 UUID로 재발급하는 Server Action.
   * 넘기지 않으면 버튼을 그리지 않는다 — 백엔드가 한 줄 연결하면 켜진다. (HANDOFF §3.14)
   */
  onResetSession?: () => Promise<ActionResult<void>>;
};

export function HomeScreen({ properties, hrefFor, map, onResetSession }: HomeScreenProps) {
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

  /*
    로그인이 없다. proxy.ts 가 발급한 익명 UUID 쿠키(rc_session)로 사용자를 구분하고,
    매물 자체는 서버 DB에 있다. 쿠키가 사라지면 데이터가 지워지는 것이 아니라 "찾아갈 열쇠"가
    없어지는 것이라, 문구를 "브라우저에 저장된다"로 쓰면 사실과 다르다. (R8)
    팀원 테스트 중 "매물이 사라졌어요"의 거의 유일한 원인이라 홈에 상시 노출한다.

    ★ 0건일 때도 낸다. 쿠키가 지워진 사용자가 보게 되는 화면이 바로 랜딩(0건)이라,
      "내 매물이 어디 갔지"에 답하는 자리가 여기다. 다만 히어로 위가 아니라 아래에 둔다.
  */
  const sessionNotice = (
    <p className="rc-notice">
      매물은 서버에 저장되지만, 로그인이 없어 <b>이 브라우저의 접속 정보(쿠키)</b>로 내 매물을
      구분합니다. 쿠키·사이트 데이터를 지우거나 다른 브라우저·기기·시크릿 창으로 열면 등록한 매물이
      보이지 않습니다.
    </p>
  );

  /*
    0건이면 랜딩만 그린다. 라우트는 그대로 `/` 다.
    "내 매물" 제목과 헤더의 [+ 매물 추가]는 함께 감춘다 — 랜딩에 히어로 CTA와 마지막 CTA가
    이미 있어서, 같은 곳으로 가는 버튼이 한 화면에 셋이 되고 제목이 히어로와 겹쳐 읽힌다.
  */
  if (total === 0) {
    return (
      <ScreenShell hrefFor={hrefFor}>
        <HomeLanding hrefFor={hrefFor} />
        {sessionNotice}
      </ScreenShell>
    );
  }

  return (
    <ScreenShell hrefFor={hrefFor}>
      <div className="rc-home-head">
        <div>
          <h2 className="rc-h2">내 매물</h2>
          <p className="rc-home-count">
            {activeCount >= 2
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
          <Link href={hrefFor('add')} className="rc-btn rc-btn-primary">
            + 매물 추가
          </Link>
        </div>
      </div>

      {/*
        매물은 있는데 비교가 안 되는 이유를 적는다.
        활성이 2건 미만이면 [매물 비교] 버튼이 조용히 사라지고 카운트 문구만 바뀌어서,
        사용자에게는 "매물이 2개인데 버튼이 없는 상태"만 보인다. /compare 에는 정확한 안내가
        있지만 그 화면에 갈 방법이 없다 — 진입점 둘이 같은 조건으로 막힌다.

        ★ 문구는 /compare 빈 상태(compare-screen.tsx)와 같은 말을 쓴다. 두 화면이 같은 상황을
          다른 말로 부르면 사용자가 다른 일로 읽는다. 고칠 때는 두 곳을 함께 고칠 것.
        ★ 버튼을 비활성으로 남기지 않는다. 눌러도 안 되는 버튼보다 이유 한 줄이 낫다.
        ★ 판정하지 않는다 — 무엇이 빠졌는지만 적고 어떻게 하라고 말하지 않는다. (R1)
      */}
      {total >= 2 && activeCount < 2 && (
        <p className="rc-home-hint">
          검토 중인 매물이 2개 이상일 때 비교할 수 있어요 — 지금은 {activeCount}개예요. 확정하거나
          제외한 매물은 비교에서 빠집니다.
        </p>
      )}

      {sessionNotice}
      {/*
        쿠키 안내 바로 아래가 자리다 — "다른 브라우저로 열면 안 보인다"는 설명 다음에
        "그럼 일부러 그렇게 하려면" 이 온다.
        0건일 때는 위에서 랜딩으로 일찍 반환하므로 여기까지 오지 않는다. 새로 시작할 것이 없고,
        랜딩 첫 화면에 이 문구가 뜨면 첫인상만 나빠진다.
      */}
      {onResetSession && <SessionReset onResetSession={onResetSession} />}

      {map ? (
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
        {/*
          조사지를 완성한 뒤에는 홈에서 조사지로 가는 길이 없었다. 국면 A 스텝은 정보 확인으로 가고,
          카드의 주 행동은 방문 기록이라, 다시 인쇄만 하려는 사람이 방문 기록 화면을 거쳐야 했다.

          ★ 주 행동을 가리지 않도록 ghost 로 두고 주 버튼 뒤에 놓는다. 라벨도 짧게 잡아 좁은 폭에서
            주 버튼과 같은 줄에 남게 한다 — 360px 기준 카드 안쪽 296px 에 상태 배지(약 72px) +
            주 버튼(최대 약 115px, '안전 점검 하기') + 이것(약 70px) + 여백 16px ≈ 273px.
            넘치더라도 .rc-prop-actions 는 flex-wrap 이라 줄이 바뀔 뿐 넘치지 않는다.
          ★ prep 에는 두지 않는다 — 아직 조사지를 완성하지 않았고, 주 행동(정보 확인)이 그리로 간다.
        */}
        {(p.status === 'ready' || p.status === 'recorded' || p.status === 'confirmed') && (
          <Link
            href={hrefFor('sheet', p.id)}
            className="rc-btn rc-btn-sm rc-btn-ghost"
            aria-label={`${p.name} 조사지 다시 보기·인쇄`}
          >
            조사지
          </Link>
        )}
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
