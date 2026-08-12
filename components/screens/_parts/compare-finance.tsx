'use client';

import { useState } from 'react';
import type { FinanceProfile, QuestionSource } from '@/db/schema';
import {
  CONVERSION_NOTICE,
  FINANCE_ASSUMPTIONS,
  FINANCE_DISCLAIMER,
  calcConversion,
  calcFinance,
  calcPrepaid,
  negotiationQuestion,
} from '@/lib/finance';
import type { ActionResult, PropertyDTO } from '@/lib/types';
import { SourceBadge } from './source-badge';
import { PREPAID_MONTHLY_NOTE, formatPrepaidMonthly } from './format';
import { GlossaryPanel } from './glossary-panel';
import { GLOSSARY_BY_SCREEN } from './glossary';

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
  /**
   * 부모(CompareScreen)의 useMutations 를 그대로 쓴다 — 직접 await 하면 중복 요청 차단·예외 흡수·
   * 저장 표시가 전부 빠진다. SaveStatus 가 부모에 있으므로 훅도 부모 것을 공유해야 한다.
   */
  mutate: <T>(
    key: string,
    action: () => Promise<ActionResult<T>>,
  ) => Promise<ActionResult<T> | null>;
  isBusy: (key: string) => boolean;
};

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

/** calcPrepaid 가 실패로 돌려준 사유 → 무엇을 넣어야 하는지. 계산 결과는 렌더하지 않는다 (#9와 같은 방식) */
const PREPAID_MISSING: Record<string, string> = {
  months_missing: '선납 개월 수를 입력하면 월 환산액이 계산됩니다.',
  total_missing: '선납 총액을 입력하면 월 환산액이 계산됩니다.',
  not_prepaid: '',
};

/** 금융 프로필을 값으로 비교하기 위한 키. 서버 렌더마다 새 객체가 오므로 참조로는 볼 수 없다 */
const profileKey = (p: FinanceProfile) =>
  [p.cash, p.loanCap, p.rate, p.cvRate].map((v) => v ?? '').join('|');

/*
 * 가정 문구는 한 덩어리 상수라 그대로 두면 모바일에서 6~7줄이 된다.
 * 새로 들어간 "기회비용 미반영"·"매매 제외"가 나머지에 묻히면 적어둔 의미가 없다.
 * 상수는 건드리지 않고 화면에서만 문장 단위로 나눈다.
 * 마침표 뒤 공백에서만 자른다 — "5.5%" 같은 소수점은 붙어 있어 잘리지 않는다.
 */
const ASSUMPTION_LINES = FINANCE_ASSUMPTIONS.split(/(?<=\.)\s+/)
  .map((line) => line.trim())
  .filter(Boolean);

export function CompareFinance({
  properties,
  finance,
  onSaveFinance,
  onAddQuestion,
  mutate,
  isBusy,
}: CompareFinanceProps) {
  const [cash, setCash] = useState(finance.cash?.toString() ?? '');
  const [loanCap, setLoanCap] = useState(finance.loanCap?.toString() ?? '');
  const [rate, setRate] = useState(finance.rate?.toString() ?? '');
  // ★ 기본값 없음. 사용자가 직접 넣은 값으로만 계산한다.
  const [cvRate, setCvRate] = useState(finance.cvRate?.toString() ?? '');

  /*
   * 서버가 내려준 금융 프로필이 바뀌면 입력칸도 따라간다.
   * useState 초기값만 쓰면 매물을 제외해 화면이 다시 그려져도, 다른 기기에서 저장한
   * 값이 들어와도 입력칸이 옛 값에 머문다.
   *
   * 객체 참조가 아니라 값으로 비교한다 — 서버 렌더마다 새 객체가 오므로 참조로 보면
   * 새로고침 때마다 입력 중인 값을 덮어쓴다.
   */
  const financeKey = profileKey(finance);
  const [syncedKey, setSyncedKey] = useState(financeKey);
  if (financeKey !== syncedKey) {
    setSyncedKey(financeKey);
    setCash(finance.cash?.toString() ?? '');
    setLoanCap(finance.loanCap?.toString() ?? '');
    setRate(finance.rate?.toString() ?? '');
    setCvRate(finance.cvRate?.toString() ?? '');
  }

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

  /*
   * 결과를 버리면 저장 실패가 화면 어디에도 나타나지 않는다. mutate 를 거쳐 SaveStatus 로 알린다.
   * 키에 payload 를 넣어 "같은 값의 중복 저장"만 막는다 — 키를 고정하면 앞선 저장이 끝나기 전에
   * 다른 칸을 빠져나올 때 그 값이 조용히 버려진다.
   */
  function persist() {
    void mutate(`finance-${profileKey(profile)}`, () => onSaveFinance(profile));
  }

  const hasInput = cash.trim() !== '' || loanCap.trim() !== '';
  const results = properties.map((p) => ({ property: p, finance: calcFinance(p, profile) }));
  // calcFinance 가 prepaid_separate 를 돌려주는 매물 — 대출·이자 대신 선납 계산을 보여준다
  const prepaidProperties = properties.filter((p) => p.dealType === '사글세');

  /* ── 전환 계산 ─────────────────────────────────────────────── */
  const cvProperty = properties.find((p) => p.id === cvPropertyId);
  const monthlyProperties = properties.filter((p) => p.dealType === '월세');
  /*
   * ★ 금리를 넣지 않았으면 이자·순변화를 화면에 내지 않는다.
   *   0 으로 계산해 보여주면 "이자가 0원"이라는, 사용자가 말한 적 없는 전제를 서비스가 제시한 것이
   *   된다. 월세 감소분이 전액 이득으로 읽힌다. (R8 — cvRate 미입력 처리와 같은 패턴)
   *   추가 보증금·새 보증금은 금리와 무관하므로 그대로 보여준다.
   */
  const hasRate = profile.rate !== undefined;
  const conversion =
    cvProperty && cvRate.trim() !== '' && targetRent.trim() !== ''
      ? calcConversion(
          cvProperty.price,
          Number(targetRent),
          Number(cvRate),
          cvProperty.deposit,
          profile.rate ?? 0, // hasRate 가 false 면 아래에서 이자·순변화를 렌더하지 않는다
        )
      : null;

  // 중복 추가를 막는 키. 값이 바뀌면 다른 질문이므로 키도 함께 바뀐다
  const negotiationText = conversion?.ok
    ? negotiationQuestion(conversion.newDeposit, Number(targetRent))
    : '';
  const negotiationKey = `negotiation-${cvPropertyId}-${negotiationText}`;

  return (
    <section className="rc-card">
      <h2 className="rc-card-title">
        금융·현금흐름 비교 <SourceBadge kind="rule" label="결정론 계산" />
      </h2>
      <p className="rc-card-sub">
        내 자금 조건을 넣으면 매물별 <b>초기 필요자금</b>과 <b>월 주거비</b>를 계산해요. 거래유형이
        달라도 이 두 축은 견줄 수 있습니다. 계산만 하고, 어느 쪽이 나은지는 판단하지 않습니다.
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
                <FinanceRow label="월 대출이자" results={results} cell={(f) => `${f.monthlyInterest}만`} />
                {/*
                  전세는 월세가 0인 게 아니라 개념이 없다. 0만으로 적으면
                  "월세가 0원인 조건"으로 읽혀 월 주거비만 보고 고르게 된다.
                */}
                <FinanceRow label="월세" results={results}
                  cell={(f, property) =>
                    property.dealType === '월세' ? (
                      `${f.rent}만`
                    ) : (
                      <span style={{ color: 'var(--rc-ink-faint)' }}>해당 없음</span>
                    )
                  } />
                <FinanceRow label="관리비" results={results} cell={(f) => `${f.mgmtFee}만`} />
                {/*
                  아래 두 행이 거래유형이 달라도 견줄 수 있는 축이다.
                  월 주거비만 강조하면 전세처럼 목돈이 묶이는 조건에서 자금 구속이 과소평가된다.
                */}
                <FinanceRow label={<b>초기 필요자금(자기자금)</b>} results={results} emphasis
                  cell={(f) => (
                    <>
                      <b>{f.upfront.toLocaleString()}만</b>
                      {f.cashShortage && (
                        <>
                          {' '}
                          <span className="rc-arr-hi">⚠ {f.shortageAmount.toLocaleString()}만 부족</span>
                        </>
                      )}
                    </>
                  )} />
                <FinanceRow label={<b>월 주거비 합계</b>} results={results} emphasis
                  cell={(f) => <b>{f.monthlyTotal}만</b>} />
              </tbody>
            </table>
          </div>
          <p className="rc-legend">
            <b>초기 필요자금</b>과 <b>월 주거비</b>는 함께 봐야 합니다. 전세는 월 부담이 작은 대신 목돈이
            묶이고, 월세는 그 반대예요. 어느 쪽이 나은지는 계산이 정하지 않습니다.
            <br />⚠ 부족 = 초기 필요자금이 보유 현금보다 큼(산술적 사실 표시이며 판정이 아닙니다).
          </p>
        </>
      ) : (
        <p className="rc-notice">자금 조건을 입력하면 매물별 월 주거비가 계산돼요.</p>
      )}

      {/*
        ── 사글세 선납 ────────────────────────────────────────────
        calcFinance 가 prepaid_separate 를 돌려주는 매물이다. 대출·이자 모델을 얹지 않고
        calcPrepaid 로 따로 계산한다 — 사용자가 넣은 값의 나눗셈·덧셈뿐이다.
        ok:false 면 계산 결과를 렌더하지 않고 무엇을 넣어야 하는지만 알린다.
      */}
      {prepaidProperties.length > 0 && (
        <div className="rc-subsection">
          <h3 className="rc-subsection-title">
            사글세 선납 계산 <SourceBadge kind="rule" label="결정론 계산" />
          </h3>
          {prepaidProperties.map((p) => {
            const r = calcPrepaid(p);
            return (
              <div key={p.id} className="rc-notice">
                <b>{p.name}</b>
                <br />
                {r.ok ? (
                  <>
                    처음 드는 돈 <b>{r.initialCash.toLocaleString()}만</b> (보증금{' '}
                    {r.deposit.toLocaleString()}만 + 선납 {r.prepaidTotal.toLocaleString()}만)
                    <br />
                    월 환산액 <b>{formatPrepaidMonthly(r.monthlyEquivalent, r.months)}</b>
                  </>
                ) : (
                  PREPAID_MISSING[r.reason]
                )}
              </div>
            );
          })}
          {/* 환산액이 화면에 있으면 각주도 반드시 있어야 한다 */}
          <p className="rc-legend">{PREPAID_MONTHLY_NOTE}</p>
        </div>
      )}

      {/*
        계산 결과가 있든 없든 항상 보인다.
        가정과 면책을 한 블록으로 묶는다 — 작은 회색 문단이 연달아 쌓이면
        아무것도 읽지 않게 된다.
      */}
      <div className="rc-disclosure">
        <p className="rc-disclosure-title">계산 가정과 면책</p>
        <ul>
          {ASSUMPTION_LINES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="rc-disclaimer">{FINANCE_DISCLAIMER}</p>
      </div>

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
                  onChange={(e) => { setCvPropertyId(e.target.value); setAdded(null); }}>
                  {monthlyProperties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — 현재 월 {p.price}만
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="rc-fl" htmlFor="rc-cv-target">목표 월세 (만원)</label>
                {/* 예시 숫자를 placeholder 에 넣지 않는다 — 그 숫자가 서비스가 제시한 기준으로 읽힌다 */}
                <input id="rc-cv-target" className="rc-input" type="number" inputMode="numeric"
                  min="0" step="1"
                  value={targetRent} placeholder="직접 입력"
                  onChange={(e) => { setTargetRent(e.target.value); setAdded(null); }} />
              </div>
              <div>
                <label className="rc-fl" htmlFor="rc-cv-rate">전환율 (연 %)</label>
                <input id="rc-cv-rate" className="rc-input" type="number" inputMode="decimal"
                  min="0" step="0.1"
                  value={cvRate} placeholder="직접 입력"
                  onChange={(e) => { setCvRate(e.target.value); setAdded(null); }} onBlur={persist} />
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
                  수준이 참고 기준이에요.{' '}
                  {/* 사용자가 넣은 값을 다시 보여준다. 값의 타당성은 판정하지 않는다 (R1·R8) */}
                  <b>전환율 {cvRate}% 기준</b>
                  <br />
                  월세 {conversion.rentReduction}만 감소
                  {hasRate && (
                    <>
                      {' '}· 추가 보증금을 전액 대출로 마련한다고 가정하면 월이자{' '}
                      {conversion.addedMonthlyInterest}만 증가 (차이 {conversion.netMonthlyChange}만)
                    </>
                  )}
                </p>
                {!hasRate && (
                  <p className="rc-notice">
                    예상 대출 금리를 입력하면 월 부담 변화가 계산됩니다.
                  </p>
                )}
                <div className="rc-notice">
                  협상 질문 예시 <SourceBadge kind="template" />
                  <br />
                  &ldquo;{negotiationText}&rdquo;
                  <div style={{ marginTop: 6 }}>
                    <button type="button" className="rc-btn rc-btn-sm"
                      disabled={isBusy(negotiationKey)}
                      onClick={() => {
                        /*
                         * 직접 await 하면 빠른 더블클릭에 질문이 두 건 들어간다 (HANDOFF §3.2 의 실제 사고).
                         * disabled 는 다음 렌더에야 걸리므로 mutate 의 ref 잠금을 거친다.
                         */
                        void mutate(negotiationKey, () =>
                          onAddQuestion(cvPropertyId, negotiationText, 'bank'),
                        ).then((r) => {
                          if (!r) return; // 같은 질문이 이미 추가되는 중이었다
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
        <div className="rc-disclosure">
          <p className="rc-disclosure-title">전환율 안내</p>
          <ul>
            <li>{CONVERSION_NOTICE}</li>
          </ul>
        </div>

        {/* 전세가율·전월세전환율·기회비용은 이 화면과 계산 가정 문구에 그대로 나온다 */}
        <GlossaryPanel terms={GLOSSARY_BY_SCREEN.finance} />
      </div>
    </section>
  );
}

function FinanceRow({
  label,
  results,
  cell,
  emphasis = false,
}: {
  label: React.ReactNode;
  results: { property: PropertyDTO; finance: ReturnType<typeof calcFinance> }[];
  cell: (
    f: Extract<ReturnType<typeof calcFinance>, { applicable: true }>,
    property: PropertyDTO,
  ) => React.ReactNode;
  /** 거래유형이 달라도 견줄 수 있는 두 축. 한쪽만 강조하면 다른 쪽이 과소평가된다 */
  emphasis?: boolean;
}) {
  return (
    <tr className={emphasis ? 'rc-key-row' : undefined}>
      <td className="rc-rowlabel">{label}</td>
      {results.map(({ property, finance }) => (
        <td key={property.id}>
          {finance.applicable ? (
            cell(finance, property)
          ) : (
            /* 사유를 구분해 적는다. 사글세를 "매매 — 계산 제외"로 쓰면 사실이 아니다 */
            <span style={{ color: 'var(--rc-ink-faint)' }}>
              {finance.reason === 'prepaid_separate' ? '사글세 — 아래 따로 계산' : '매매 — 계산 제외'}
            </span>
          )}
        </td>
      ))}
    </tr>
  );
}
