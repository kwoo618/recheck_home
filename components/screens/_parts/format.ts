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

/** 프로토타입 fmtPrice() 그대로 */
export function formatPrice(p: PriceFields): string {
  if (p.dealType === '월세') {
    return `보증금 ${p.deposit || 0}만 / 월 ${p.price || 0}만`;
  }
  const price = p.price || 0;
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
  const parts = [formatPrice(p), `${p.age}년차`, p.heating];
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
