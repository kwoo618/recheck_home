import type { PropertyStatus } from '@/db/schema';
import type { ScreenRoute } from './nav';

/**
 * 상태 → 화면 표기 + 다음 행동 (프로토타입 statusInfo())
 *
 * ★ 여기서 상태를 바꾸지 않는다. 전이는 서버(canTransition)가 강제한다.
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
  prep: { label: '정보 확인 필요', className: 'rc-st-prep', action: '정보 확인하기', route: 'confirm' },
  ready: { label: '방문 대기', className: 'rc-st-ready', action: '방문 기록 입력', route: 'record' },
  recorded: { label: '기록 완료', className: 'rc-st-recorded', action: '안전 점검 하기', route: 'safety' },
  confirmed: { label: '계약 확정', className: 'rc-st-confirmed', action: '계약·입주 절차', route: 'contract' },
  excluded: { label: '제외됨', className: 'rc-st-excluded', action: '다시 검토', route: 'confirm' },
};

export function statusInfo(status: PropertyStatus): StatusInfo {
  return STATUS_INFO[status] ?? STATUS_INFO.prep;
}

/** 비교 대상 = 활성 매물 (status ∉ {confirmed, excluded}) */
export function isActive(status: PropertyStatus): boolean {
  return status !== 'confirmed' && status !== 'excluded';
}
