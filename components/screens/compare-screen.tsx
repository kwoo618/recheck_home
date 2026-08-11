'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { FinanceProfile, PropertyStatus, QuestionSource } from '@/db/schema';
import { DISTANCE_NOTICE, SCHOOL_ORIGIN, formatDistance, formatDistanceLabel } from '@/lib/geo';
import type { ActionResult, PropertyDTO } from '@/lib/types';
import { ScreenShell } from './_parts/screen-shell';
import { SourceBadge } from './_parts/source-badge';
import { useMutations } from './_parts/use-mutations';
import { SaveStatus } from './_parts/save-status';
import { CompareFinance } from './_parts/compare-finance';
import { formatPrice } from './_parts/format';
import { isActive } from './_parts/status';
import type { HrefFor } from './_parts/nav';

/**
 * ⑥ 매물 비교 (프로토타입 viewCompare)
 *
 * ★ 비교 대상은 활성 매물뿐이다 (status ∉ {confirmed, excluded}).
 * ★ ▲▼ 는 수치의 높낮이지 우열이 아니다. 범례를 표 아래에 반드시 둔다.
 *   순위를 매기거나 "이 매물이 낫다"는 표현을 만들지 않는다. (R1)
 * ★ 거리 문구는 formatDistanceLabel()·formatDistance() 를 쓴다. 좌표가 없으면
 *   0 이 아니라 "위치 미지정"이고, 표가 아니라 아래 별도 안내로 뺀다.
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
      const result = onSummarize
        ? await onSummarize(ps.map((p) => p.id))
        : { ok: false, summary: undefined };
      setSummarizing(false);
      if (result.ok && result.summary) {
        setSummary(result.summary);
        return;
      }
      setSummary(null);
      setSummaryFailed(true);
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
              <tr>
                <td className="rc-rowlabel">도보 추정</td>
                {located.map((p) => (
                  <td key={p.id}>{formatDistanceLabel(p.distanceFromSchool)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="rc-legend">{DISTANCE_NOTICE}</p>
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
              <NumberRow properties={ps} label="가격 (만원)" pick={(p) => p.price} marks={!mixedDeal} />
              {ps.some((p) => p.dealType === '월세') && (
                <NumberRow
                  properties={ps}
                  label="보증금 (만원)"
                  pick={(p) => p.deposit}
                  marks={!mixedDeal}
                />
              )}
              <NumberRow properties={ps} label="관리비 (만원)" pick={(p) => p.mgmtFee} />
              {ps.some((p) => p.area > 0) && <NumberRow properties={ps} label="면적 (㎡)" pick={(p) => p.area} />}
              <NumberRow properties={ps} label="연식 (년차)" pick={(p) => p.age} />
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
        <p className="rc-legend">
          ▲ 최고값 · ▼ 최저값 — <b>수치의 높고 낮음 표시일 뿐, 우열 판정이 아닙니다.</b> (가격은 낮을수록,
          층수는 취향에 따라 다르게 볼 수 있어요)
        </p>

        {mixedDeal && (
          <p className="rc-notice rc-notice-info">
            <b>{[...dealTypes].join('·')}가 섞여 있어 가격·보증금은 직접 비교할 수 없습니다.</b> 전세금과
            월세는 성격이 다른 금액이라 높낮이를 견주는 것이 의미가 없어서, 두 행에는 ▲▼를 붙이지
            않았습니다.
            <br />
            거래유형이 달라도 견줄 수 있는 축은 아래 <b>③ 금융·현금흐름</b>의{' '}
            <b>월 주거비</b>(월세 + 관리비 + 월이자)와 <b>초기 필요자금</b>이에요. 자금 조건을 입력하면
            계산됩니다.
            {dealTypes.has('매매') && ' 매매는 상환 구조가 달라 이 계산에서 빠집니다.'}
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
}: {
  properties: PropertyDTO[];
  label: string;
  pick: (p: PropertyDTO) => number;
  unit?: string;
  /** false면 값만 적는다. 서로 다른 축의 값이라 높낮이를 견줄 수 없을 때 쓴다 */
  marks?: boolean;
}) {
  const values = properties.map(pick);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const varied = marks && max !== min;

  return (
    <tr>
      <td className="rc-rowlabel">{label}</td>
      {properties.map((p, i) => (
        <td key={p.id}>
          {values[i].toLocaleString()}
          {unit}
          {varied && values[i] === max && <span className="rc-arr-hi"> ▲</span>}
          {varied && values[i] === min && <span className="rc-arr-lo"> ▼</span>}
        </td>
      ))}
    </tr>
  );
}
