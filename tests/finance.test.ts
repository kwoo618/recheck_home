import { describe, it, expect } from 'vitest';
import {
  calcFinance,
  calcConversion,
  negotiationQuestion,
  FINANCE_DISCLAIMER,
  FINANCE_ASSUMPTIONS,
  CONVERSION_NOTICE,
} from '@/lib/finance';
import { containsBanned } from '@/lib/rules';

/**
 * lib/finance.ts 유닛 테스트
 *
 * 이 모듈은 "계산은 시스템, 판단은 사용자" 원칙의 핵심이다.
 * 숫자 정확성뿐 아니라 "판정성 표현을 만들지 않는다"(R1)까지 회귀 방지 대상으로 삼는다.
 * 모든 금액 단위는 만원.
 */

describe('calcFinance — 매매 제외', () => {
  it('매매는 상환 구조가 달라 v1 계산에서 제외한다', () => {
    const r = calcFinance(
      { dealType: '매매', price: 20000, deposit: 0, mgmtFee: 5 },
      { cash: 5000, loanCap: 10000, rate: 4 },
    );
    expect(r.applicable).toBe(false);
    expect(r).toEqual({ applicable: false, reason: 'sale_excluded' });
  });
});

describe('calcFinance — 월세', () => {
  it('필요보증금은 보증금이고, 월 주거비는 월세+관리비+월이자다', () => {
    const r = calcFinance(
      { dealType: '월세', price: 45, deposit: 500, mgmtFee: 5 },
      { cash: 300, loanCap: 1000, rate: 4 },
    );

    expect(r.applicable).toBe(true);
    if (!r.applicable) return;

    expect(r.need).toBe(500);
    expect(r.loan).toBe(200); // max(0, 500-300) = 200, 한도 1000 이내
    expect(r.upfront).toBe(300); // 500 - 200
    expect(r.monthlyInterest).toBe(0.7); // 200 * 0.04 / 12 = 0.667 → 0.7
    expect(r.rent).toBe(45);
    expect(r.mgmtFee).toBe(5);
    expect(r.monthlyTotal).toBe(50.7);
  });

  it('보유 현금이 필요보증금보다 많으면 대출은 0이다', () => {
    const r = calcFinance(
      { dealType: '월세', price: 45, deposit: 500, mgmtFee: 5 },
      { cash: 1000, loanCap: 3000, rate: 4 },
    );
    if (!r.applicable) throw new Error('applicable이어야 한다');

    expect(r.loan).toBe(0);
    expect(r.upfront).toBe(500);
    expect(r.monthlyInterest).toBe(0);
    expect(r.cashShortage).toBe(false);
    expect(r.shortageAmount).toBe(0);
  });
});

describe('calcFinance — 전세', () => {
  it('필요보증금은 전세금이고 월세는 0이다', () => {
    const r = calcFinance(
      { dealType: '전세', price: 8500, deposit: 0, mgmtFee: 3 },
      { cash: 3000, loanCap: 4000, rate: 4 },
    );
    if (!r.applicable) throw new Error('applicable이어야 한다');

    expect(r.need).toBe(8500);
    expect(r.loan).toBe(4000); // max(0, 8500-3000)=5500 이지만 한도 4000에서 잘림
    expect(r.upfront).toBe(4500);
    expect(r.monthlyInterest).toBe(13.3); // 4000 * 0.04 / 12 = 13.333 → 13.3
    expect(r.rent).toBe(0);
    expect(r.monthlyTotal).toBe(16.3); // 0 + 3 + 13.3
  });

  it('초기 자기자금이 보유 현금을 넘으면 부족액을 산술적 사실로 표시한다 (판정 아님)', () => {
    const r = calcFinance(
      { dealType: '전세', price: 8500, deposit: 0, mgmtFee: 3 },
      { cash: 3000, loanCap: 4000, rate: 4 },
    );
    if (!r.applicable) throw new Error('applicable이어야 한다');

    expect(r.cashShortage).toBe(true);
    expect(r.shortageAmount).toBe(1500); // 4500 - 3000
  });
});

describe('calcFinance — 경계값', () => {
  it('빈 금융 프로필이면 대출 0, 자기자금은 필요보증금 전액이다', () => {
    const r = calcFinance({ dealType: '전세', price: 5000, deposit: 0, mgmtFee: 0 }, {});
    if (!r.applicable) throw new Error('applicable이어야 한다');

    expect(r.loan).toBe(0);
    expect(r.upfront).toBe(5000);
    expect(r.monthlyInterest).toBe(0);
    expect(r.monthlyTotal).toBe(0);
    expect(r.cashShortage).toBe(true);
    expect(r.shortageAmount).toBe(5000);
  });

  it('대출 한도가 0이면 전액 자기자금이다', () => {
    const r = calcFinance(
      { dealType: '전세', price: 5000, deposit: 0, mgmtFee: 0 },
      { cash: 1000, loanCap: 0, rate: 4 },
    );
    if (!r.applicable) throw new Error('applicable이어야 한다');

    expect(r.loan).toBe(0);
    expect(r.upfront).toBe(5000);
  });

  it('음수 입력은 0으로 보정한다', () => {
    const r = calcFinance(
      { dealType: '전세', price: 5000, deposit: 0, mgmtFee: 0 },
      { cash: -100, loanCap: -100, rate: -5 },
    );
    if (!r.applicable) throw new Error('applicable이어야 한다');

    expect(r.loan).toBe(0);
    expect(r.monthlyInterest).toBe(0);
    expect(r.upfront).toBe(5000);
  });

  it('금리가 0이면 월이자도 0이다', () => {
    const r = calcFinance(
      { dealType: '전세', price: 8500, deposit: 0, mgmtFee: 3 },
      { cash: 0, loanCap: 8500, rate: 0 },
    );
    if (!r.applicable) throw new Error('applicable이어야 한다');

    expect(r.loan).toBe(8500);
    expect(r.monthlyInterest).toBe(0);
    expect(r.monthlyTotal).toBe(3);
  });

  it('같은 입력이면 항상 같은 출력이다 (결정론)', () => {
    const p = { dealType: '월세' as const, price: 45, deposit: 500, mgmtFee: 5 };
    const profile = { cash: 300, loanCap: 1000, rate: 4 };
    expect(calcFinance(p, profile)).toEqual(calcFinance(p, profile));
  });
});

describe('calcConversion — 보증금↔월세 전환 (참고 계산)', () => {
  it('전환율이 0 이하면 계산하지 않는다 (0으로 나누기 방지)', () => {
    expect(calcConversion(45, 20, 0, 500)).toEqual({ ok: false, reason: 'invalid_rate' });
    expect(calcConversion(45, 20, -1, 500)).toEqual({ ok: false, reason: 'invalid_rate' });
  });

  it('목표 월세가 현재보다 낮지 않으면 계산하지 않는다', () => {
    expect(calcConversion(45, 45, 5.5, 500)).toEqual({ ok: false, reason: 'target_not_lower' });
    expect(calcConversion(45, 50, 5.5, 500)).toEqual({ ok: false, reason: 'target_not_lower' });
  });

  it('추가보증금 = (현재월세 − 목표월세) × 12 ÷ (전환율/100)', () => {
    const r = calcConversion(45, 20, 5.5, 500, 4);
    if (!r.ok) throw new Error('ok여야 한다');

    expect(r.rentReduction).toBe(25);
    expect(r.additionalDeposit).toBe(5455); // 25 * 12 / 0.055 = 5454.54… → 5455
    expect(r.newDeposit).toBe(5955); // 500 + 5455
  });

  it('추가 보증금을 전액 대출로 마련한다고 가정한 월이자 증가분을 함께 낸다', () => {
    const r = calcConversion(45, 20, 5.5, 500, 4);
    if (!r.ok) throw new Error('ok여야 한다');

    expect(r.addedMonthlyInterest).toBe(18.2); // 5455 * 0.04 / 12 = 18.18… → 18.2
    expect(r.netMonthlyChange).toBe(6.8); // 25 − 18.2
  });

  it('대출 금리가 높으면 순변화가 음수가 될 수 있다 (사실 서술이지 판정 아님)', () => {
    const r = calcConversion(45, 20, 5.5, 500, 10);
    if (!r.ok) throw new Error('ok여야 한다');

    expect(r.netMonthlyChange).toBeLessThan(0);
  });

  it('대출 금리를 생략하면 이자 증가분은 0이다', () => {
    const r = calcConversion(45, 20, 5.5, 500);
    if (!r.ok) throw new Error('ok여야 한다');

    expect(r.addedMonthlyInterest).toBe(0);
    expect(r.netMonthlyChange).toBe(25);
  });
});

describe('negotiationQuestion — 결정론 템플릿 (AI 아님)', () => {
  it('계산된 숫자를 그대로 문장에 넣는다', () => {
    const q = negotiationQuestion(5955, 20);
    expect(q.replace(/,/g, '')).toContain('5955만원');
    expect(q).toContain('20만원');
    expect(q).toContain('?');
  });

  it('같은 입력이면 항상 같은 문장이다', () => {
    expect(negotiationQuestion(5955, 20)).toBe(negotiationQuestion(5955, 20));
  });
});

describe('R1 가드레일 — 금융 모듈은 판정성 표현을 만들지 않는다', () => {
  it('상시 노출 문구에 금칙어가 없다', () => {
    expect(containsBanned(FINANCE_DISCLAIMER)).toBe(false);
    expect(containsBanned(FINANCE_ASSUMPTIONS)).toBe(false);
    expect(containsBanned(CONVERSION_NOTICE)).toBe(false);
  });

  it('협상 질문 템플릿에 금칙어가 없다', () => {
    expect(containsBanned(negotiationQuestion(5955, 20))).toBe(false);
  });

  it('면책·가정 문구가 화면에 필요한 핵심 내용을 담고 있다', () => {
    expect(FINANCE_DISCLAIMER).toContain('참고용');
    expect(FINANCE_DISCLAIMER).toContain('투자자문이 아닙니다');
    expect(FINANCE_ASSUMPTIONS).toContain('이자만 상환');
    expect(CONVERSION_NOTICE).toContain('강제력');
  });
});
