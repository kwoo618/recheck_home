'use client';

import { useState } from 'react';
import type { FinanceProfile, QuestionSource } from '@/db/schema';
import {
  CONVERSION_NOTICE,
  FINANCE_ASSUMPTIONS,
  FINANCE_DISCLAIMER,
  calcConversion,
  calcFinance,
  negotiationQuestion,
} from '@/lib/finance';
import type { ActionResult, PropertyDTO } from '@/lib/types';
import { SourceBadge } from './source-badge';

/**
 * 비교 ③ 금융·현금흐름 + 보증금↔월세 전환 계산기 (PRD §6)
 *
 * ★ 계산은 lib/finance.ts 의 순수 함수만 쓴다. 화면에서 다시 계산하지 않는다.
 *   프로토타입은 월 주거비에서 관리비를 빠뜨렸다(rent + 이자). 계약·PRD §6.1 은
 *   월세 + 관리비 + 월이자다.
 * ★ 전환율에는 기본값을 넣지 않는다. 화면에 숫자가 미리 떠 있으면 사용자는 그것을
 *   "서비스가 알려준 기준"으로 받아들이는데, 그 순간 서비스가 기준을 제시한 것이 된다.
 * ★ FINANCE_DISCLAIMER · FINANCE_ASSUMPTIONS · CONVERSION_NOTICE 는 상시 노출한다.
 *   계산 결과가 있을 때만 띄우지 않는다.
 */
export type CompareFinanceProps = {
  properties: PropertyDTO[];
  finance: FinanceProfile;
  onSaveFinance: (profile: FinanceProfile) => Promise<ActionResult<void>>;
  onAddQuestion: (
    propertyId: string,
    text: string,
    source: QuestionSource,
  ) => Promise<ActionResult<{ id: string }>>;
};

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

export function CompareFinance({
  properties,
  finance,
  onSaveFinance,
  onAddQuestion,
}: CompareFinanceProps) {
  const [cash, setCash] = useState(finance.cash?.toString() ?? '');
  const [loanCap, setLoanCap] = useState(finance.loanCap?.toString() ?? '');
  const [rate, setRate] = useState(finance.rate?.toString() ?? '');
  // ★ 기본값 없음. 사용자가 직접 넣은 값으로만 계산한다.
  const [cvRate, setCvRate] = useState(finance.cvRate?.toString() ?? '');

  const [targetRent, setTargetRent] = useState('');
  const [cvPropertyId, setCvPropertyId] = useState(
    properties.find((p) => p.dealType === '월세')?.id ?? '',
  );
  const [added, setAdded] = useState<string | null>(null);

  const profile: FinanceProfile = {
    cash: num(cash),
    loanCap: num(loanCap),
    rate: num(rate),
    cvRate: num(cvRate),
  };

  function persist() {
    void onSaveFinance(profile);
  }

  const hasInput = cash.trim() !== '' || loanCap.trim() !== '';
  const results = properties.map((p) => ({ property: p, finance: calcFinance(p, profile) }));

  /* ── 전환 계산 ─────────────────────────────────────────────── */
  const cvProperty = properties.find((p) => p.id === cvPropertyId);
  const monthlyProperties = properties.filter((p) => p.dealType === '월세');
  const conversion =
    cvProperty && cvRate.trim() !== '' && targetRent.trim() !== ''
      ? calcConversion(
          cvProperty.price,
          Number(targetRent),
          Number(cvRate),
          cvProperty.deposit,
          profile.rate ?? 0,
        )
      : null;

  return (
    <section className="rc-card">
      <h2 className="rc-card-title">
        금융·현금흐름 비교 <SourceBadge kind="rule" label="결정론 계산" />
      </h2>
      <p className="rc-card-sub">
        내 자금 조건을 넣으면 매물별 <b>월 주거비</b>를 계산해요. 계산만 하고, 어느 쪽이 나은지는
        판단하지 않습니다.
      </p>

      <div className="rc-fgrid" style={{ marginBottom: 12 }}>
        <div>
          <label className="rc-fl" htmlFor="rc-fin-cash">보유 현금 (만원)</label>
          <input id="rc-fin-cash" className="rc-input" type="number" inputMode="numeric"
            value={cash} onChange={(e) => setCash(e.target.value)} onBlur={persist} />
        </div>
        <div>
          <label className="rc-fl" htmlFor="rc-fin-loan">대출 가능 금액 (만원)</label>
          <input id="rc-fin-loan" className="rc-input" type="number" inputMode="numeric"
            value={loanCap} onChange={(e) => setLoanCap(e.target.value)} onBlur={persist} />
        </div>
        <div>
          <label className="rc-fl" htmlFor="rc-fin-rate">예상 대출 금리 (연 %)</label>
          <input id="rc-fin-rate" className="rc-input" type="number" inputMode="decimal" step="0.1"
            value={rate} onChange={(e) => setRate(e.target.value)} onBlur={persist} />
        </div>
      </div>

      {hasInput ? (
        <>
          <div className="rc-cmp-scroll">
            <table className="rc-cmp">
              <thead>
                <tr>
                  <th />
                  {properties.map((p) => (
                    <th key={p.id}>{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <FinanceRow label="필요 보증금·전세금" results={results}
                  cell={(f) => `${f.need.toLocaleString()}만`} />
                <FinanceRow label="예상 대출" results={results}
                  cell={(f) => `${f.loan.toLocaleString()}만`} />
                <FinanceRow label="초기 필요자금(자기자금)" results={results}
                  cell={(f) => (
                    <>
                      {f.upfront.toLocaleString()}만
                      {f.cashShortage && (
                        <>
                          {' '}
                          <span className="rc-arr-hi">⚠ {f.shortageAmount.toLocaleString()}만 부족</span>
                        </>
                      )}
                    </>
                  )} />
                <FinanceRow label="월 대출이자" results={results} cell={(f) => `${f.monthlyInterest}만`} />
                <FinanceRow label="월세" results={results} cell={(f) => `${f.rent}만`} />
                <FinanceRow label="관리비" results={results} cell={(f) => `${f.mgmtFee}만`} />
                <FinanceRow label={<b>월 주거비 합계</b>} results={results}
                  cell={(f) => <b>{f.monthlyTotal}만</b>} />
              </tbody>
            </table>
          </div>
          <p className="rc-legend">
            ⚠ 부족 = 초기 필요자금이 보유 현금보다 큼(산술적 사실 표시이며 판정이 아닙니다).
          </p>
        </>
      ) : (
        <p className="rc-notice">자금 조건을 입력하면 매물별 월 주거비가 계산돼요.</p>
      )}

      {/* 계산 결과가 있든 없든 항상 보인다 */}
      <p className="rc-legend">{FINANCE_ASSUMPTIONS}</p>
      <p className="rc-notice rc-notice-warn">{FINANCE_DISCLAIMER}</p>

      {/* ── 보증금 ↔ 월세 전환 ───────────────────────────────── */}
      <div className="rc-subsection">
        <h3 className="rc-subsection-title">
          보증금↔월세 전환 참고 계산 <SourceBadge kind="rule" />
        </h3>

        {monthlyProperties.length === 0 ? (
          <p className="rc-notice">월세 매물이 없어 전환 계산을 쓸 수 없어요.</p>
        ) : (
          <>
            <div className="rc-fgrid">
              <div>
                <label className="rc-fl" htmlFor="rc-cv-prop">대상 매물 (월세)</label>
                <select id="rc-cv-prop" className="rc-select" value={cvPropertyId}
                  onChange={(e) => setCvPropertyId(e.target.value)}>
                  {monthlyProperties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — 현재 월 {p.price}만
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="rc-fl" htmlFor="rc-cv-target">목표 월세 (만원)</label>
                <input id="rc-cv-target" className="rc-input" type="number" inputMode="numeric"
                  value={targetRent} placeholder="예: 20"
                  onChange={(e) => setTargetRent(e.target.value)} />
              </div>
              <div>
                <label className="rc-fl" htmlFor="rc-cv-rate">전환율 (연 %)</label>
                <input id="rc-cv-rate" className="rc-input" type="number" inputMode="decimal" step="0.1"
                  value={cvRate} placeholder="직접 입력"
                  onChange={(e) => setCvRate(e.target.value)} onBlur={persist} />
              </div>
            </div>

            {cvRate.trim() === '' ? (
              <p className="rc-notice">전환율을 입력하면 참고 계산이 표시됩니다.</p>
            ) : conversion === null ? (
              <p className="rc-notice">목표 월세를 입력하면 참고 계산이 표시됩니다.</p>
            ) : !conversion.ok ? (
              <p className="rc-notice">
                {conversion.reason === 'invalid_rate'
                  ? '전환율은 0보다 큰 값이어야 해요.'
                  : '목표 월세는 현재 월세보다 낮아야 해요.'}
              </p>
            ) : (
              <>
                <p className="rc-notice">
                  월세 {cvProperty!.price}만 → {targetRent}만으로 낮추려면 보증금 약{' '}
                  <b>{conversion.additionalDeposit.toLocaleString()}만원 추가</b> (
                  {cvProperty!.deposit.toLocaleString()}만 → {conversion.newDeposit.toLocaleString()}만)
                  수준이 참고 기준이에요.
                  <br />
                  월세 {conversion.rentReduction}만 감소 · 추가 보증금을 전액 대출로 마련한다고 가정하면
                  월이자 {conversion.addedMonthlyInterest}만 증가 (차이 {conversion.netMonthlyChange}만)
                </p>
                <div className="rc-notice">
                  협상 질문 예시 <SourceBadge kind="template" />
                  <br />
                  &ldquo;{negotiationQuestion(conversion.newDeposit, Number(targetRent))}&rdquo;
                  <div style={{ marginTop: 6 }}>
                    <button type="button" className="rc-btn rc-btn-sm"
                      onClick={() => {
                        const text = negotiationQuestion(conversion.newDeposit, Number(targetRent));
                        void onAddQuestion(cvProperty!.id, text, 'bank').then((r) => {
                          setAdded(r.ok ? '질문 목록에 추가했어요.' : r.error);
                        });
                      }}>
                      이 매물 질문 목록에 추가
                    </button>
                    {added && <span className="rc-field-note"> {added}</span>}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* 계산 결과 여부와 무관하게 항상 노출 (PRD §11 리스크) */}
        <p className="rc-legend">{CONVERSION_NOTICE}</p>
      </div>
    </section>
  );
}

function FinanceRow({
  label,
  results,
  cell,
}: {
  label: React.ReactNode;
  results: { property: PropertyDTO; finance: ReturnType<typeof calcFinance> }[];
  cell: (f: Extract<ReturnType<typeof calcFinance>, { applicable: true }>) => React.ReactNode;
}) {
  return (
    <tr>
      <td className="rc-rowlabel">{label}</td>
      {results.map(({ property, finance }) => (
        <td key={property.id}>
          {finance.applicable ? (
            cell(finance)
          ) : (
            <span style={{ color: 'var(--rc-ink-faint)' }}>매매 — 계산 제외</span>
          )}
        </td>
      ))}
    </tr>
  );
}
