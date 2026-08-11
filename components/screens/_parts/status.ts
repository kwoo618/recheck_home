import type { PropertyStatus } from '@/db/schema';
// 배럴(@/components/map)이 아니라 순수 모듈에서 직접 가져온다 — 클라이언트 컴포넌트를 끌고 오지 않기 위함
import { STATUS_PIN } from '@/components/map/status-pin';
import type { ScreenRoute } from './nav';

/**
 * 상태 → 화면 표기 + 다음 행동 (프로토타입 statusInfo())
 *
 * ★ 여기서 상태를 바꾸지 않는다. 전이는 서버(canTransition)가 강제한다.
 * ★ 상태 문구는 STATUS_PIN(components/map)에서 가져온다. 카드 배지와 지도 핀이
 *   같은 상태를 다른 말로 부르면 사용자가 다른 것으로 읽는다.
 * ★ 다음 행동 경로는 허용 전이와 일치해야 한다:
 *     prep → confirm(정보 확인) → sheet → ready
 *     ready → record → recorded
 *     recorded → safety → confirmed
 *   ready 에서 곧바로 safety(계약 확정)로 가는 경로는 두지 않는다.
 *   방문 기록 없이 계약을 확정하는 흐름이라 이 서비스가 막으려는 행동에 해당한다.
 */
export type StatusInfo = {
  label: string;
  className: string;
  action: string;
  route: ScreenRoute;
};

const STATUS_INFO: Record<PropertyStatus, StatusInfo> = {
  prep: { label: STATUS_PIN.prep.label, className: 'rc-st-prep', action: '정보 확인하기', route: 'confirm' },
  ready: { label: STATUS_PIN.ready.label, className: 'rc-st-ready', action: '방문 기록 입력', route: 'record' },
  recorded: { label: STATUS_PIN.recorded.label, className: 'rc-st-recorded', action: '안전 점검 하기', route: 'safety' },
  confirmed: { label: STATUS_PIN.confirmed.label, className: 'rc-st-confirmed', action: '계약·입주 절차', route: 'contract' },
  excluded: { label: STATUS_PIN.excluded.label, className: 'rc-st-excluded', action: '다시 검토', route: 'confirm' },
};

export function statusInfo(status: PropertyStatus): StatusInfo {
  return STATUS_INFO[status] ?? STATUS_INFO.prep;
}

/** 비교 대상 = 활성 매물 (status ∉ {confirmed, excluded}) */
export function isActive(status: PropertyStatus): boolean {
  return status !== 'confirmed' && status !== 'excluded';
}
