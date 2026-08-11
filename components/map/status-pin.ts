import type { PropertyStatus } from '@/db/schema';

/**
 * 지도 핀 표시 규약 (PRD v2.1 §1.3)
 *
 * ★ 핀 색상은 **검증 상태로만** 구분한다.
 *   가격 높낮이를 색으로 암시하는 것은 판정에 해당하므로 금지. (R1)
 * ★ 색상만으로 구분하지 않고 **텍스트 라벨을 병기**한다.
 *   색각 이상·흑백 인쇄·작은 화면에서 색은 정보를 전달하지 못한다.
 *
 * 순수 모듈 — DOM·SDK에 의존하지 않으므로 유닛 테스트 대상이다.
 */

export type PinStyle = {
  /** 카드 배지와 동일한 문구. 화면 전체에서 상태를 같은 말로 부르기 위함 */
  label: string;
  /** 핀처럼 폭이 좁은 곳에서 쓰는 짧은 문구 (PRD §1.3 표기) */
  shortLabel: string;
  /** 핀 배경색 */
  color: string;
  /** 핀 위 글자색 — 배경과의 대비를 확보한 값 */
  textColor: string;
};

/**
 * 색상은 프로토타입(docs/recheck-prototype-v4.html)의 상태 배지 팔레트를 그대로 쓴다.
 * 카드 배지와 지도 핀이 다른 색이면 같은 상태를 다른 것으로 읽게 된다.
 */
export const STATUS_PIN: Record<PropertyStatus, PinStyle> = {
  prep: {
    label: '정보 확인 필요',
    shortLabel: '검토중',
    color: '#5A5E66',
    textColor: '#FFFFFF',
  },
  ready: {
    label: '방문 대기',
    shortLabel: '방문대기',
    color: '#2C5FA8',
    textColor: '#FFFFFF',
  },
  recorded: {
    label: '기록 완료',
    shortLabel: '기록완료',
    color: '#B7791F',
    textColor: '#FFFFFF',
  },
  confirmed: {
    label: '계약 확정',
    shortLabel: '확정',
    color: '#145C54',
    textColor: '#FFFFFF',
  },
  excluded: {
    label: '제외됨',
    shortLabel: '제외',
    color: '#B23A3A',
    textColor: '#FFFFFF',
  },
};

/** 알 수 없는 상태가 들어와도 지도가 비지 않도록 prep으로 수렴시킨다 */
export function pinStyle(status: string): PinStyle {
  return STATUS_PIN[status as PropertyStatus] ?? STATUS_PIN.prep;
}

/**
 * 지도 하단 고정 문구 (PRD §4.3 · CLAUDE.md UI 규약).
 * "이 지도는 탐색 도구가 아니다"를 사용자에게 계속 상기시키는 장치이므로
 * 지도가 떴을 때든 폴백 리스트일 때든 항상 노출한다.
 */
export const MAP_NOTICE =
  '등록한 매물만 표시됩니다. 지도에서 새 매물을 찾지 않습니다.';

/** 좌표를 얻지 못한 매물을 지도 아래에 따로 안내할 때 쓰는 제목 */
export const NO_LOCATION_TITLE = '위치 미지정';
