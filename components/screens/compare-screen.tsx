'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { FinanceProfile, PropertyStatus, QuestionSource } from '@/db/schema';
import { DISTANCE_NOTICE, SCHOOL_ORIGIN, estimateWalkMinutes, formatDistance } from '@/lib/geo';
import { calcPrepaid, type PrepaidResult } from '@/lib/finance';
import type { ActionResult, PropertyDTO } from '@/lib/types';
import { ScreenShell } from './_parts/screen-shell';
import { SourceBadge } from './_parts/source-badge';
import { useMutations } from './_parts/use-mutations';
import { SaveStatus } from './_parts/save-status';
import { CompareFinance } from './_parts/compare-finance';
import {
  PREPAID_MONTHLY_NOTE,
  formatPrepaidMonthlyShort,
  formatPrice,
} from './_parts/format';
import { isActive } from './_parts/status';
import type { HrefFor } from './_parts/nav';

/**
 * ⑥ 매물 비교 (프로토타입 viewCompare)
 *
 * ★ 비교 대상은 활성 매물뿐이다 (status ∉ {confirmed, excluded}).
 * ★ ▲▼ 는 수치의 높낮이지 우열이 아니다. 범례를 표 아래에 반드시 둔다.
 *   순위를 매기거나 "이 매물이 낫다"는 표현을 만들지 않는다. (R1)
 * ★ 거리 문구는 lib/geo 의 함수만 쓴다. 열이 좁은 표에서는 짧은 값(formatDistance·
 *   estimateWalkMinutes)만 넣고, 기준점 이름과 "직선거리 기준 추정"은 표 밖 DISTANCE_NOTICE 에
 *   한 번만 둔다 (components/screens/README.md §거리 문구). 좌표가 없으면 0 이 아니라
 *   "위치 미지정"이고, 표가 아니라 아래 별도 안내로 뺀다.
 */
export type CompareScreenProps = {
  properties: PropertyDTO[];
  hrefFor: HrefFor;
  finance: FinanceProfile;
  onSaveFinance: (profile: FinanceProfile) => Promise<ActionResult<void>>;
  onAddQuestion: (
    propertyId: string,
    text: string,
    source: QuestionSource,
  ) => Promise<ActionResult<{ id: string }>>;
  onSetStatus: (propertyId: string, next: PropertyStatus) => Promise<ActionResult<void>>;
  /** POST /api/ai/summary `{propertyIds[]}` → `{ok, summary?}` — 실패하면 표만 보여준다 */
  onSummarize?: (propertyIds: string[]) => Promise<{ ok: boolean; summary?: string }>;
  /** 지도 패널. 없으면 거리 표만 보여준다 (지도 실패 폴백과 같은 경로 — R4) */
  map?: ReactNode;
};

export function CompareScreen({
  properties,
  hrefFor,
  finance,
  onSaveFinance,
  onAddQuestion,
  onSetStatus,
  onSummarize,
  map,
}: CompareScreenProps) {
  const router = useRouter();
  const { run: mutate, isBusy, saveState } = useMutations();
  const [error, setError] = useState('');
  const [confirmingExclude, setConfirmingExclude] = useState<string | null>(null);

  const [summary, setSummary] = useState<string | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  // 화면에서도 한 번 더 거른다 — 확정·제외된 매물이 섞여 들어오면 비교의 뜻이 달라진다
  const ps = properties.filter((p) => isActive(p.status));

  if (ps.length < 2) {
    return (
      <ScreenShell hrefFor={hrefFor}>
        <Link href={hrefFor('dash')} className="rc-back">
          ← 매물 목록
        </Link>
        <div className="rc-card">
          <h2 className="rc-card-title">비교할 매물이 아직 없어요</h2>
          <p className="rc-card-sub">
            검토 중인 매물이 2개 이상일 때 비교할 수 있어요. 확정하거나 제외한 매물은 비교에서
            빠집니다.
          </p>
          <div className="rc-form-actions">
            <Link href={hrefFor('add')} className="rc-btn rc-btn-primary">
              + 매물 추가
            </Link>
            <Link href={hrefFor('dash')} className="rc-btn rc-btn-ghost">
              매물 목록
            </Link>
          </div>
        </div>
      </ScreenShell>
    );
  }

  const located = ps.filter((p) => p.distanceFromSchool !== null);
  const unlocated = ps.filter((p) => p.distanceFromSchool === null);
  // 거래유형이 섞이면 원시 가격은 같은 축의 값이 아니게 된다
  const dealTypes = new Set(ps.map((p) => p.dealType));
  const mixedDeal = dealTypes.size > 1;
  /*
    사글세 — 주 시나리오는 "사글세끼리" 비교다.
    전부 사글세일 때만 처음 드는 돈·월 환산액으로 견준다. 유형이 섞이면 환산하지 않는다.
    환산에는 재계약 횟수나 기간 가정이 반드시 끼어들고, 그 순간 서비스가 기준을 제시한 것이 된다. (R8)
  */
  const allPrepaid = ps.every((p) => p.dealType === '사글세');
  const anyPrepaid = ps.some((p) => p.dealType === '사글세');
  const prepaidResults = new Map(ps.map((p) => [p.id, calcPrepaid(p)]));
  const hasRecords = ps.some(
    (p) => p.visitChecks.some((v) => v.result !== '') || p.questions.some((q) => q.answer !== ''),
  );
  const allQuestions = [...new Set(ps.flatMap((p) => p.questions.map((q) => q.text)))];

  function exclude(id: string) {
    setConfirmingExclude(null);
    void mutate(`exclude-${id}`, () => onSetStatus(id, 'excluded')).then((result) => {
      if (!result) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError('');
      // 비교 대상이 바뀌면 앞서 받은 요약은 이제 없는 매물 이야기를 담고 있다
      setSummary(null);
      setSummaryFailed(false);
      router.refresh();
    });
  }

  function summarize() {
    setSummarizing(true);
    setSummaryFailed(false);
    void (async () => {
      try {
        const result = onSummarize
          ? await onSummarize(ps.map((p) => p.id))
          : { ok: false, summary: undefined };
        if (result.ok && result.summary) {
          setSummary(result.summary);
          return;
        }
        setSummary(null);
        setSummaryFailed(true);
      } catch {
        /*
         * /api/ai/summary 는 실패해도 200 + {ok:false} 로 답하지만(R4), 네트워크 단절·타임아웃은
         * fetch 자체를 reject 시킨다. 잡지 않으면 unhandled rejection 이 되고,
         * setSummarizing(false) 에 도달하지 못해 스피너가 영원히 돈다.
         */
        setSummary(null);
        setSummaryFailed(true);
      } finally {
        setSummarizing(false);
      }
    })();
  }

  return (
    <ScreenShell hrefFor={hrefFor}>
      <Link href={hrefFor('dash')} className="rc-back">
        ← 매물 목록
      </Link>
      <SaveStatus state={saveState} />
      <h1 className="rc-h2">매물 비교</h1>
      <p className="rc-home-count" style={{ marginBottom: 14 }}>
        {ps.length}개 매물 비교 중 — 선택은 항상 사용자의 몫이에요.
      </p>

      {/* ── ① 위치 ───────────────────────────────────────────── */}
      <section className="rc-card">
        <h2 className="rc-card-title">
          ① 위치 <SourceBadge kind="rule" label="규칙 기반" />
        </h2>
        {map}
        {/*
          좌표를 얻은 매물이 하나도 없으면 표를 그리지 않는다.
          그리면 빈 <th> 하나에 라벨 열만 남은 뼈대가 먼저 보이고, 정작 읽어야 할 안내는 그 아래에 있다.
        */}
        {located.length === 0 ? (
          <p className="rc-field-note" style={{ marginTop: map ? 12 : 0 }}>
            좌표를 얻은 매물이 없어 거리 비교를 표시할 수 없어요.
          </p>
        ) : (
          <>
            <div className="rc-cmp-scroll" style={{ marginTop: map ? 12 : 0 }}>
              <table className="rc-cmp">
                <thead>
                  <tr>
                    <th />
                    {located.map((p) => (
                      <th key={p.id}>{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="rc-rowlabel">주소</td>
                    {located.map((p) => (
                      <td key={p.id}>{p.address || '—'}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="rc-rowlabel">{SCHOOL_ORIGIN.name} 직선거리</td>
                    {located.map((p) => (
                      <td key={p.id}>{formatDistance(p.distanceFromSchool)}</td>
                    ))}
                  </tr>
                  {/*
                    formatDistanceLabel() 전문을 칸마다 넣지 않는다 (components/screens/README.md §거리 문구).
                    기준점 이름과 "직선거리 기준 추정"이 매물 수만큼 반복되면서 표를 밀어내고,
                    같은 정보가 바로 위 행·아래 DISTANCE_NOTICE 와 함께 세 번 나온다.
                    열이 좁은 표에서는 짧은 값만 넣고 단서는 표 밖에 한 번만 둔다.
                  */}
                  <tr>
                    <td className="rc-rowlabel">도보 추정</td>
                    {located.map((p) => (
                      <td key={p.id}>약 {estimateWalkMinutes(p.distanceFromSchool)}분</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="rc-legend">{DISTANCE_NOTICE}</p>
          </>
        )}
        {unlocated.length > 0 && (
          <p className="rc-notice">
            위치 미지정 {unlocated.length}건: {unlocated.map((p) => p.name).join(', ')} — 좌표를 얻지
            못해 거리 비교에서 빠졌어요. 나머지 비교는 그대로 됩니다.
          </p>
        )}
      </section>

      {/* ── ② 기본 스펙 ──────────────────────────────────────── */}
      <section className="rc-card">
        <h2 className="rc-card-title">
          ② 기본 스펙 <SourceBadge kind="rule" label="정량 비교" />
        </h2>
        <div className="rc-cmp-scroll">
          <table className="rc-cmp">
            <thead>
              <tr>
                <th />
                {ps.map((p) => (
                  <th key={p.id}>{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="rc-rowlabel">거래</td>
                {ps.map((p) => (
                  <td key={p.id}>{formatPrice(p)}</td>
                ))}
              </tr>
              {/*
                거래유형이 섞이면 가격·보증금에 ▲▼를 붙이지 않는다.
                전세 8,500만과 월세 45만은 같은 축의 값이 아니라서, 화살표를 그리면
                "전세가 189배 비싸다"로 읽힌다. 그건 사실이 아니다.
              */}
              {/* 사글세끼리면 price 가 전부 0이라 —만 늘어선 행이 된다. 선납 총액이 그 자리다 */}
              {!allPrepaid && (
                <NumberRow
                  properties={ps}
                  label="가격 (만원)"
                  pick={(p) => p.price}
                  marks={!mixedDeal}
                  blankZero
                />
              )}
              {/* 사글세도 보증금이 따로 있다 — 월세일 때만 보여주면 사글세 매물의 보증금이 사라진다 */}
              {ps.some((p) => p.dealType === '월세' || p.dealType === '사글세') && (
                <NumberRow
                  properties={ps}
                  label="보증금 (만원)"
                  pick={(p) => p.deposit}
                  marks={!mixedDeal}
                />
              )}

              {/*
                선납 정보. null("아직 입력하지 않음")은 칸을 비우고, 0("선납 없음")은 —로 적는다.
                사글세가 아닌 매물에는 "해당 없음"이라고 쓴다 — 빈칸이면 미입력과 구분되지 않는다.
              */}
              {anyPrepaid && (
                <>
                  <PrepaidRawRow properties={ps} label="선납 총액 (만원)" pick={(p) => p.prepaidTotal} />
                  <PrepaidRawRow properties={ps} label="선납 개월" pick={(p) => p.prepaidMonths} unit="개월" />
                </>
              )}

              {/*
                아래 두 행은 사글세끼리일 때만 그린다. 유형이 섞이면 같은 축의 값이 아니다.
                월 환산액에는 기간을 반드시 붙인다 — "50만"만 적으면 6개월과 12개월이 같아 보이고
                총액이 다르다는 사실이 숨는다.
              */}
              {allPrepaid && (
                <>
                  <PrepaidCalcRow
                    properties={ps}
                    results={prepaidResults}
                    label="처음 드는 돈 (만원)"
                    pick={(r) => r.initialCash}
                    render={(r) => r.initialCash.toLocaleString()}
                  />
                  <PrepaidCalcRow
                    properties={ps}
                    results={prepaidResults}
                    label="월 환산액"
                    pick={(r) => r.monthlyEquivalent}
                    render={(r) => formatPrepaidMonthlyShort(r.monthlyEquivalent, r.months)}
                  />
                </>
              )}
              {/*
                관리비에는 blankZero 를 쓰지 않는다. 관리비가 실제로 0원인 매물이 있어서
                0을 —("입력 안 함")로 적으면 사실과 다른 표기가 된다. (HANDOFF §3.8 · R8)
              */}
              <NumberRow properties={ps} label="관리비 (만원)" pick={(p) => p.mgmtFee} />
              {/*
                면적을 비워두면 서버가 0으로 저장한다. 스키마가 nullable 이 아니라
                "0㎡"와 "입력 안 함"을 값으로 구분할 수 없다.
                0 을 —로 적고 비교에서도 빼서, 없는 값이 최저값으로 읽히지 않게 한다.
                ★ 관리비는 같은 처리를 하지 않는다. 관리비가 실제로 0원인 매물이 있어서
                  0 을 "모름"으로 적으면 사실과 다른 표기가 된다. (R8)
              */}
              {ps.some((p) => p.area > 0) && (
                <NumberRow properties={ps} label="면적 (㎡)" pick={(p) => p.area} blankZero />
              )}
              <NumberRow properties={ps} label="연식 (년차)" pick={(p) => p.age} blankZero />
              <tr>
                <td className="rc-rowlabel">난방</td>
                {ps.map((p) => (
                  <td key={p.id}>{p.heating}</td>
                ))}
              </tr>
              <tr>
                <td className="rc-rowlabel">현장 &lsquo;문제있음&rsquo;</td>
                {ps.map((p) => {
                  const bad = p.visitChecks.filter((v) => v.result === 'bad');
                  return (
                    <td key={p.id} className={bad.length ? 'rc-bad-cell' : ''}>
                      {bad.length}건
                      {bad.length > 0 && ` — ${bad.map((v) => v.title).join(', ')}`}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="rc-rowlabel">미확인 항목</td>
                {ps.map((p) => {
                  const n =
                    p.visitChecks.filter((v) => v.result === '' || v.result === 'na').length +
                    p.questions.filter((q) => q.answer === '' && !q.noAnswer).length;
                  return (
                    <td key={p.id} className={n ? 'rc-miss' : ''}>
                      {n ? `${n}건` : '없음'}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        {/*
          색의 뜻을 상시로 적는다. 전에는 AI 요약이 실패했을 때 뜨는 문구에만 있어서,
          요약이 정상이면 노란 칸·빨간 글씨가 무엇인지 알 방법이 없었다.
          ★ "주의가 필요한 항목" 같은 표현을 쓰지 않는다. 빨강은 사용자가 직접 입력한 기록을
            그대로 옮긴 것이지 서비스가 매긴 값이 아니다. (R1)
        */}
        <p className="rc-legend">
          ▲ 최고값 · ▼ 최저값 — <b>수치의 높고 낮음 표시일 뿐, 우열 판정이 아닙니다.</b> (가격은 낮을수록,
          층수는 취향에 따라 다르게 볼 수 있어요)
          <br />— 는 입력하지 않은 값이에요. 비교에서도 빠집니다.
          <br />
          노란 칸 = 미확인 · 빨간 글씨 = 사용자가 &lsquo;문제있음&rsquo;으로 기록한 항목. 둘 다 입력한
          기록을 그대로 옮긴 것이고, 서비스가 판정한 결과가 아닙니다.
          {/* 월 환산액을 보여주는 곳에는 각주를 반드시 함께 둔다 — 없으면 월세로 읽힌다 */}
          {allPrepaid && (
            <>
              <br />
              {PREPAID_MONTHLY_NOTE}
            </>
          )}
        </p>

        {/* ★ 사글세끼리면 이 안내가 뜨면 안 된다 — 환산하지 않은 것이 아니라 같은 축으로 비교한 것이다 */}
        {mixedDeal && (
          <p className="rc-notice rc-notice-info">
            <b>계약 유형이 다르면 같은 기준으로 환산하지 않았습니다.</b> ({[...dealTypes].join('·')})
            성격이 다른 금액이라 높낮이를 견주는 것이 의미가 없어서, 가격·보증금 행에는 ▲▼를 붙이지
            않고 입력한 값을 그대로 두었습니다.
            {anyPrepaid && (
              <>
                {' '}
                사글세를 다른 유형과 같은 기간 기준으로 바꾸려면 재계약 횟수를 가정해야 하는데, 그
                가정은 사용자가 넣은 값이 아닙니다.
              </>
            )}
            <br />
            거래유형이 달라도 견줄 수 있는 축은 아래 <b>③ 금융·현금흐름</b>의{' '}
            <b>월 주거비</b>(월세 + 관리비 + 월이자)와 <b>초기 필요자금</b>이에요. 자금 조건을 입력하면
            계산됩니다.
            {dealTypes.has('매매') && ' 매매는 상환 구조가 달라 이 계산에서 빠집니다.'}
            {dealTypes.has('사글세') && ' 사글세는 선납금을 ③에서 따로 계산합니다.'}
            {dealTypes.has('월세') && ' 보증금과 월세를 맞바꾸면 어떻게 되는지는 ③의 전환 계산기에서 확인할 수 있어요.'}
          </p>
        )}
      </section>

      {/* ── ③ 금융 ───────────────────────────────────────────── */}
      <CompareFinance
        properties={ps}
        finance={finance}
        onSaveFinance={onSaveFinance}
        onAddQuestion={onAddQuestion}
        mutate={mutate}
        isBusy={isBusy}
      />

      {/* ── ④ 질문-답변 상세 ─────────────────────────────────── */}
      <section className="rc-card">
        <h2 className="rc-card-title">
          ④ 질문-답변 상세 <SourceBadge kind="user" label="직접 조사" />
        </h2>
        {allQuestions.length === 0 ? (
          <p className="rc-field-note">질문 데이터가 아직 없어요.</p>
        ) : (
          <div className="rc-cmp-scroll">
            <table className="rc-cmp">
              <thead>
                <tr>
                  <th />
                  {ps.map((p) => (
                    <th key={p.id}>{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allQuestions.map((text) => (
                  <tr key={text}>
                    {/* 질문 전문이라 nowrap 을 쓰지 않는다 — 답변 열이 밀려나면 비교가 안 된다 */}
                    <td className="rc-rowlabel rc-rowlabel-long">{text}</td>
                    {ps.map((p) => {
                      const q = p.questions.find((x) => x.text === text);
                      if (!q) {
                        return (
                          <td key={p.id} style={{ color: 'var(--rc-ink-faint)' }}>
                            질문 안 함
                          </td>
                        );
                      }
                      if (q.noAnswer) {
                        return (
                          <td key={p.id} className="rc-miss">
                            답 못 들음
                          </td>
                        );
                      }
                      return q.answer ? (
                        <td key={p.id}>{q.answer}</td>
                      ) : (
                        <td key={p.id} className="rc-miss">
                          미확인
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {allQuestions.length > 0 && (
          /* ②와 같은 이유로 상시 노출한다. 이 표에는 노란 칸의 뜻이 두 가지라 함께 적는다 */
          <p className="rc-legend">
            노란 칸 = 답을 듣지 못했거나 아직 답을 기록하지 않은 질문 ·{' '}
            <span style={{ color: 'var(--rc-ink-faint)' }}>질문 안 함</span> = 그 매물에는 이 질문을
            하지 않았어요. 전부 입력한 기록을 그대로 옮긴 것입니다.
          </p>
        )}

        <div className="rc-form-actions">
          <button
            type="button"
            className="rc-btn"
            disabled={!hasRecords || summarizing}
            onClick={summarize}
          >
            차이점 AI 요약 <SourceBadge kind="ai" />
          </button>
          {!hasRecords && (
            <span className="rc-field-note">방문 기록을 입력하면 요약할 수 있어요</span>
          )}
          {summarizing && (
            <span className="rc-field-note">
              <span className="rc-spinner" /> 기록된 차이점을 정리하는 중...
            </span>
          )}
        </div>

        {summary && (
          <div className="rc-ai-summary">
            {summary}
            {'\n\n'}
            <span style={{ fontSize: '11.5px', opacity: 0.7 }}>
              — AI는 기록의 차이만 정리하며, 우열 판단은 하지 않습니다.
            </span>
          </div>
        )}
        {summaryFailed && (
          <p className="rc-notice">
            AI 요약을 사용할 수 없어요. 위 표에서 노란 칸(미확인)과 빨간 글씨(문제있음)를 중심으로 비교해
            보세요.
          </p>
        )}
      </section>

      {/* ── ⑤ 선택 ───────────────────────────────────────────── */}
      <section className="rc-card">
        <h2 className="rc-card-title">⑤ 선택</h2>
        <p className="rc-card-sub">
          비교를 마쳤다면 진행할 매물을 고르세요. 나머지를 제외하면 목록이 정리돼요.
        </p>
        <div className="rc-choice-grid">
          {ps.map((p) => (
            <div key={p.id} className="rc-choice">
              <div className="rc-choice-name">{p.name}</div>
              {p.status === 'recorded' ? (
                <Link href={hrefFor('safety', p.id)} className="rc-btn rc-btn-sm rc-btn-primary">
                  이 매물로 진행
                </Link>
              ) : (
                <Link href={hrefFor('record', p.id)} className="rc-btn rc-btn-sm">
                  방문 기록 먼저 입력
                </Link>
              )}
              {/* 되돌릴 수 있는 동작이라 모달까지 띄우지 않고 한 번만 되묻는다 */}
              {confirmingExclude === p.id ? (
                <>
                  <span className="rc-field-note">목록에서 빼고 비교에서 제외할까요?</span>
                  <button
                    type="button"
                    className="rc-btn rc-btn-sm rc-btn-danger"
                    disabled={isBusy(`exclude-${p.id}`)}
                    onClick={() => exclude(p.id)}
                  >
                    제외
                  </button>
                  <button
                    type="button"
                    className="rc-btn rc-btn-sm rc-btn-ghost"
                    onClick={() => setConfirmingExclude(null)}
                  >
                    취소
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="rc-btn rc-btn-sm rc-btn-ghost rc-btn-danger"
                  disabled={isBusy(`exclude-${p.id}`)}
                  onClick={() => setConfirmingExclude(p.id)}
                >
                  제외
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {error && <p className="rc-error">{error}</p>}
    </ScreenShell>
  );
}

/**
 * 사글세 선납 원본값 행 — 사용자가 입력한 값을 그대로 옮긴다. 계산하지 않는다.
 *
 * ★ null 과 0 을 다르게 그린다. null 은 "아직 입력하지 않음"이라 빈 칸으로 두고,
 *   0 은 "선납 없음"이라 —로 적는다. 둘을 같게 그리면 사용자가 넣지 않은 사실이 생긴다. (R8)
 * ★ 사글세가 아닌 매물은 "해당 없음"이다 — 빈 칸이면 미입력과 구분되지 않는다.
 * ▲▼ 를 붙이지 않는다. 선납 총액은 기간이 다르면 같은 축의 값이 아니다.
 */
function PrepaidRawRow({
  properties,
  label,
  pick,
  unit = '',
}: {
  properties: PropertyDTO[];
  label: string;
  pick: (p: PropertyDTO) => number | null;
  unit?: string;
}) {
  return (
    <tr>
      <td className="rc-rowlabel">{label}</td>
      {properties.map((p) => {
        if (p.dealType !== '사글세') {
          return (
            <td key={p.id} style={{ color: 'var(--rc-ink-faint)' }}>
              해당 없음
            </td>
          );
        }
        const v = pick(p);
        if (v === null) return <td key={p.id} className="rc-miss">미입력</td>;
        if (v === 0) {
          return (
            <td key={p.id} style={{ color: 'var(--rc-ink-faint)' }}>
              —
            </td>
          );
        }
        return (
          <td key={p.id}>
            {v.toLocaleString()}
            {unit}
          </td>
        );
      })}
    </tr>
  );
}

/**
 * 사글세 계산 행 — calcPrepaid 결과만 쓴다. 화면에서 다시 계산하지 않는다.
 *
 * 사글세끼리일 때만 그리므로 ▲▼ 를 붙인다(같은 축의 값이다).
 * ok:false 면 계산 결과를 렌더하지 않고 무엇을 넣어야 하는지만 적는다 — #9(금리 미입력)와 같은 방식.
 */
const PREPAID_MISSING: Record<string, string> = {
  months_missing: '선납 개월 수 미입력',
  total_missing: '선납 총액 미입력',
  not_prepaid: '해당 없음',
};

function PrepaidCalcRow({
  properties,
  results,
  label,
  pick,
  render,
}: {
  properties: PropertyDTO[];
  results: Map<string, PrepaidResult>;
  label: string;
  pick: (r: Extract<PrepaidResult, { ok: true }>) => number;
  render: (r: Extract<PrepaidResult, { ok: true }>) => string;
}) {
  const ok = properties
    .map((p) => results.get(p.id))
    .filter((r): r is Extract<PrepaidResult, { ok: true }> => r?.ok === true);
  const values = ok.map(pick);
  const max = values.length ? Math.max(...values) : 0;
  const min = values.length ? Math.min(...values) : 0;
  const varied = values.length > 1 && max !== min;

  return (
    <tr className="rc-key-row">
      <td className="rc-rowlabel">
        <b>{label}</b>
      </td>
      {properties.map((p) => {
        const r = results.get(p.id);
        if (!r || !r.ok) {
          return (
            <td key={p.id} className="rc-miss">
              {PREPAID_MISSING[r?.reason ?? 'not_prepaid'] ?? '해당 없음'}
            </td>
          );
        }
        const v = pick(r);
        return (
          <td key={p.id}>
            <b>{render(r)}</b>
            {varied && v === max && <span className="rc-arr-hi"> ▲</span>}
            {varied && v === min && <span className="rc-arr-lo"> ▼</span>}
          </td>
        );
      })}
    </tr>
  );
}

/**
 * 숫자 행 — 최고 ▲(빨강) · 최저 ▼(파랑).
 * 값이 전부 같으면 아무 표시도 하지 않는다. 표시가 순위로 읽히면 안 되므로
 * 범례("수치의 높낮이일 뿐 우열이 아님")를 표 아래에 항상 함께 둔다.
 */
function NumberRow({
  properties,
  label,
  pick,
  unit = '',
  marks = true,
  blankZero = false,
}: {
  properties: PropertyDTO[];
  label: string;
  pick: (p: PropertyDTO) => number;
  unit?: string;
  /** false면 값만 적는다. 서로 다른 축의 값이라 높낮이를 견줄 수 없을 때 쓴다 */
  marks?: boolean;
  /** 0을 "입력 안 함"으로 보고 —로 적으며 최고·최저 계산에서 뺀다 */
  blankZero?: boolean;
}) {
  const values = properties.map(pick);
  const comparable = blankZero ? values.filter((v) => v > 0) : values;
  const max = comparable.length ? Math.max(...comparable) : 0;
  const min = comparable.length ? Math.min(...comparable) : 0;
  const varied = marks && comparable.length > 1 && max !== min;

  return (
    <tr>
      <td className="rc-rowlabel">{label}</td>
      {properties.map((p, i) => {
        const value = values[i];
        if (blankZero && value === 0) {
          return (
            <td key={p.id} style={{ color: 'var(--rc-ink-faint)' }}>
              —
            </td>
          );
        }
        return (
          <td key={p.id}>
            {value.toLocaleString()}
            {unit}
            {varied && value === max && <span className="rc-arr-hi"> ▲</span>}
            {varied && value === min && <span className="rc-arr-lo"> ▼</span>}
          </td>
        );
      })}
    </tr>
  );
}
