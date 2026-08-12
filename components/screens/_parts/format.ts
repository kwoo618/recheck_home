import type { PropertyDTO } from '@/lib/types';
import type { VisitResult } from '@/db/schema';

/**
 * 화면 표시용 포맷터.
 *
 * ★ 판정하지 않는다. 값을 읽기 좋게 바꾸기만 한다.
 * ★ 원래 lib/ 에 있는 편이 맞지만 이 세션은 lib/ 쓰기 범위 밖이라 여기 둔다.
 *   (백엔드 세션 병합 후 이동 검토 — 인벤토리 A 항목에 보고함)
 */

type PriceFields = Pick<PropertyDTO, 'dealType' | 'price' | 'deposit'>;

/**
 * 입력하지 않은 숫자 필드는 0으로 저장된다 — 스키마가 nullable 이 아니라 "0"과 "미입력"을
 * 값으로 구분할 수 없다. 0을 그대로 적으면 "전세 0만"·"0년차"처럼 사실이 아닌 조건이 되므로
 * —로 바꾼다. (면적을 그렇게 처리한 HANDOFF §3.8 과 같은 방식)
 *
 * ★ 관리비에는 쓰지 않는다. 관리비가 실제로 0원인 매물이 있어서 —로 적으면 사실과 달라진다. (R8)
 *   입력 라벨의 "관리비가 없으면 0을 입력하세요"가 0의 의미를 사용자 의도로 확정한다.
 * ★ 연식 0은 "신축 당해년도"와 "미입력"을 구분할 수 없다. 미입력이 훨씬 흔해 미입력으로 본다.
 *   구분하려면 스키마를 nullable 로 바꿔야 하므로 알려진 한계로 남긴다.
 */
const DASH = '—';

/** 프로토타입 fmtPrice() 에 미입력(0) 처리를 더한 것 */
export function formatPrice(p: PriceFields): string {
  if (p.dealType === '월세') {
    // 보증금 0은 그대로 둔다 — 무보증 월세가 실제로 있어 미입력으로 단정할 수 없다
    const rent = p.price > 0 ? `${p.price.toLocaleString()}만` : DASH;
    return `보증금 ${(p.deposit || 0).toLocaleString()}만 / 월 ${rent}`;
  }
  const price = p.price || 0;
  if (price === 0) return `${p.dealType} ${DASH}`;
  if (price >= 10000) {
    const eok = Math.floor(price / 10000);
    const rest = price % 10000;
    return `${p.dealType} ${eok}억${rest ? ` ${rest.toLocaleString()}만` : ''}`;
  }
  return `${p.dealType} ${price.toLocaleString()}만`;
}

type SpecFields = PriceFields & Pick<PropertyDTO, 'age' | 'heating' | 'floor' | 'mgmtFee'>;

/**
 * 카드·상세 헤더의 한 줄 요약.
 * 프로토타입은 관리비를 아예 다루지 않았다 — 계약(PropertyDTO.mgmtFee)에 있어 되살렸다.
 */
export function formatSpecLine(p: SpecFields): string {
  const parts = [formatPrice(p)];
  if (p.age > 0) parts.push(`${p.age}년차`);
  parts.push(p.heating);
  if (p.floor) parts.push(`${p.floor}층`);
  if (p.mgmtFee > 0) parts.push(`관리비 ${p.mgmtFee}만`);
  return parts.join(' · ');
}

/** 방문 기록 4택 라벨 — 프로토타입 resLabel() 그대로 */
export function resultLabel(r: VisitResult): string {
  const map: Record<VisitResult, string> = {
    '': '—',
    good: '좋음',
    ok: '보통',
    bad: '문제있음',
    na: '미확인',
  };
  return map[r] ?? '—';
}
