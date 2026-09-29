// 가상 데이터
import { describe, it, expect } from 'vitest';
import { formatPrice, formatSpecLine } from '@/components/screens/_parts/format';

/**
 * 인쇄 헤더(survey-sheet-print · safety-print)가 쓰는 한 줄 요약.
 *
 * v1 기록(V1-OUT-OF-SCOPE)의 "사글세 인쇄 헤더가 `사글세 — · 22년차`로 나온다"가
 * 다시 생기지 않게 고정한다. 사글세는 보증금 + 선납(총액·개월)이 헤더에 들어간다.
 */

const base = { price: 0, deposit: 100, prepaidMonths: 6, prepaidTotal: 300 } as const;
const spec = { age: 22, heating: '개별난방', floor: '2', mgmtFee: 5 } as const;

describe('formatPrice · formatSpecLine — 사글세 인쇄 헤더', () => {
  it('사글세는 보증금과 선납 총액·개월 수를 적는다', () => {
    expect(formatPrice({ dealType: '사글세', ...base })).toBe('보증금 100만 / 선납 300만 (6개월)');
  });

  it('헤더 한 줄이 "사글세 —"로 시작하지 않는다', () => {
    const line = formatSpecLine({ dealType: '사글세', ...base, ...spec });
    expect(line).toBe('보증금 100만 / 선납 300만 (6개월) · 22년차 · 개별난방 · 2층 · 관리비 5만');
    expect(line).not.toContain('사글세 —');
  });

  it('선납을 입력하지 않았으면(null) 선납 조각을 만들지 않는다 — 0으로 접지 않는다', () => {
    expect(formatPrice({ dealType: '사글세', ...base, prepaidMonths: null, prepaidTotal: null })).toBe('보증금 100만');
  });

  it('선납 0(선납 없음)은 —로 적는다', () => {
    expect(formatPrice({ dealType: '사글세', ...base, prepaidMonths: 0, prepaidTotal: 0 })).toBe('보증금 100만 / 선납 —');
  });

  it('월 환산액은 헤더에 넣지 않는다 — 각주를 둘 수 없는 자리다', () => {
    expect(formatPrice({ dealType: '사글세', ...base })).not.toContain('환산');
  });
});
