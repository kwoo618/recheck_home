import type { DealType, FinanceProfile } from '@/db/schema';

/**
 * 금융·현금흐름 계산 (PRD v2.1 §6)
 *
 * ★ 계산 = 시스템(이 파일) / 설명 = AI(선택) / 판단 = 사용자
 * ★ 이 파일은 숫자만 반환한다. "유리/불리", 추천, 순위를 만들지 않는다.
 * ★ 모든 금액 단위는 만원. 순수 함수(부수효과 없음).
 *
 * 계산 가정 — 반드시 화면에 명시할 것:
 *   · 대출 이자는 '이자만 상환' 방식으로 단순 계산 (원금 상환 미반영)
 *   · 중개보수·이사비·입주청소 등 초기 부대비용 미포함
 *   · 실제 대출 한도·금리는 금융기관 심사에 따라 달라짐
 */

export type PropertyFinanceInput = {
  dealType: DealType;
  price: number;    // 월세면 월세액, 전세면 전세금
  deposit: number;  // 월세 보증금
  mgmtFee: number;  // 관리비
};

export type FinanceResult =
  | { applicable: false; reason: 'sale_excluded' }
  | {
      applicable: true;
      need: number;      // 필요 보증금/전세금
      loan: number;      // 예상 대출
      upfront: number;   // 초기 필요자금(자기자금)
      monthlyInterest: number;
      rent: number;
      mgmtFee: number;
      monthlyTotal: number; // 월 주거비 = 월세 + 관리비 + 월이자
      /** 초기 필요자금이 보유 현금보다 큰 상태 (산술적 사실 표시 — 판정 아님) */
      cashShortage: boolean;
      shortageAmount: number;
    };

const r1 = (n: number) => Math.round(n * 10) / 10;

export function calcFinance(
  p: PropertyFinanceInput,
  profile: FinanceProfile,
): FinanceResult {
  // 매매는 주택담보대출 상환 구조가 전월세와 달라 v1 계산에서 제외
  if (p.dealType === '매매') return { applicable: false, reason: 'sale_excluded' };

  const cash = Math.max(0, profile.cash ?? 0);
  const loanCap = Math.max(0, profile.loanCap ?? 0);
  const rate = Math.max(0, profile.rate ?? 0);

  const need = p.dealType === '월세' ? p.deposit : p.price;
  const loan = Math.min(Math.max(0, need - cash), loanCap);
  const upfront = need - loan;
  const monthlyInterest = r1((loan * (rate / 100)) / 12);
  const rent = p.dealType === '월세' ? p.price : 0;
  const mgmtFee = p.mgmtFee ?? 0;

  return {
    applicable: true,
    need, loan, upfront, monthlyInterest, rent, mgmtFee,
    monthlyTotal: r1(rent + mgmtFee + monthlyInterest),
    cashShortage: upfront > cash,
    shortageAmount: Math.max(0, upfront - cash),
  };
}

/* ══════════════════════════════════════════════════════════════
   보증금 ↔ 월세 전환 (참고 계산)

   추가보증금 = (현재월세 − 목표월세) × 12 ÷ (전환율/100)

   ⚠ 법정 전월세전환율은 '갱신 계약'의 상한 기준이며
      신규 계약 협상에 강제력이 없다. 화면에 라벨로 고정 노출할 것.
   ══════════════════════════════════════════════════════════════ */
export type ConversionResult =
  | { ok: false; reason: 'target_not_lower' | 'invalid_rate' }
  | {
      ok: true;
      additionalDeposit: number;
      newDeposit: number;
      rentReduction: number;
      /** 추가 보증금을 전액 대출로 마련한다고 가정했을 때의 월 이자 증가분 */
      addedMonthlyInterest: number;
      /** 월세 감소액 − 추가 이자. 음수면 이자 증가분이 더 큼 (사실 서술) */
      netMonthlyChange: number;
    };

export function calcConversion(
  currentRent: number,
  targetRent: number,
  conversionRate: number,
  currentDeposit: number,
  loanRate = 0,
): ConversionResult {
  if (conversionRate <= 0) return { ok: false, reason: 'invalid_rate' };
  if (targetRent >= currentRent) return { ok: false, reason: 'target_not_lower' };

  const rentReduction = currentRent - targetRent;
  const additionalDeposit = Math.round((rentReduction * 12) / (conversionRate / 100));
  const addedMonthlyInterest = r1((additionalDeposit * (loanRate / 100)) / 12);

  return {
    ok: true,
    additionalDeposit,
    newDeposit: currentDeposit + additionalDeposit,
    rentReduction,
    addedMonthlyInterest,
    netMonthlyChange: r1(rentReduction - addedMonthlyInterest),
  };
}

/**
 * 협상 질문 문장 — 결정론 템플릿 (AI 아님)
 * 숫자가 이미 계산돼 있으므로 문장 생성에 AI가 불필요하다.
 */
export function negotiationQuestion(newDeposit: number, targetRent: number): string {
  return `보증금을 ${newDeposit.toLocaleString()}만원 수준으로 올리는 대신 월세를 ${targetRent}만원으로 조정할 수 있을까요?`;
}

/** 화면에 상시 노출해야 하는 면책 문구 */
export const FINANCE_DISCLAIMER =
  '본 계산은 참고용이며 금융상품 권유·투자자문이 아닙니다. 실제 대출 한도·금리·조건은 금융기관에서 확인하세요.';

export const FINANCE_ASSUMPTIONS =
  '가정: 이자만 상환 방식, 월 주거비 = 월세 + 관리비 + 대출 월이자. 중개보수·이사비 등 초기 부대비용은 포함되지 않았습니다.';

export const CONVERSION_NOTICE =
  '법정 전월세전환율은 갱신 계약의 상한 기준이며, 신규 계약 협상에는 강제력이 없습니다. 실제 조건은 임대인과의 협의로 정해집니다.';
