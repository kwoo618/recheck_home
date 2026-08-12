'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PropertyStatus } from '@/db/schema';
import { selectSafetyRules, type RuleContext } from '@/lib/rules';
import type { ActionResult, PropertyDTO } from '@/lib/types';
import type { CheckGroup } from '@/lib/actions/checks';
import { ScreenShell } from './_parts/screen-shell';
import { PropertyHeader } from './_parts/property-header';
import { SourceBadge } from './_parts/source-badge';
import { useMutations } from './_parts/use-mutations';
import { SaveStatus } from './_parts/save-status';
import { SafetyPrint } from './safety-print';
import type { HrefFor } from './_parts/nav';

/**
 * ⑦ 계약 전 안전 점검 (프로토타입 viewSafety)
 *
 * 방 상태가 아니라 **내 보증금과 권리**를 지키는 단계다.
 *
 * ★ 항목·필수 구분은 lib/rules.ts 의 SAFETY_RULES 가 단일 소스다.
 *   프로토타입은 매매 항목 id 가 s-price 였는데 계약은 s-deal-price 다.
 *   id 가 다르면 서버가 거부하고 체크가 저장되지 않는다.
 * ★ '필수'는 보증금·권리에 직결된다는 **분류**이지 판정이 아니다.
 *   미확인 배너도 "확인되지 않은 항목이 있다"는 사실만 말한다.
 * ★ 진입은 recorded 이상. 방문 기록도 없이 계약을 확정하는 흐름은 만들지 않는다. (F 방침)
 * ★ 상태 전이는 서버가 한다. 여기서는 확인을 한 번 거친 뒤 setStatus 를 부를 뿐이다.
 */
export type SafetyScreenProps = {
  property: PropertyDTO;
  hrefFor: HrefFor;
  onToggleCheck: (
    propertyId: string,
    group: CheckGroup,
    ruleId: string,
    on: boolean,
  ) => Promise<ActionResult<void>>;
  onSetStatus: (propertyId: string, next: PropertyStatus) => Promise<ActionResult<void>>;
};

export function SafetyScreen({ property: p, hrefFor, onToggleCheck, onSetStatus }: SafetyScreenProps) {
  const router = useRouter();
  const { run: mutate, isBusy, busy, saveState } = useMutations();
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  const ctx: RuleContext = {
    dealType: p.dealType,
    age: p.age,
    heating: p.heating,
    floor: p.floor,
    deposit: p.deposit,
  };
  const rules = selectSafetyRules(ctx);
  const missingCritical = rules.filter((r) => r.critical && !p.safetyChecks[r.id]);

  // 방문 기록 전에는 이 화면을 쓰지 않는다. 링크를 직접 열어 들어온 경우를 막는다.
  const reachable = p.status === 'recorded' || p.status === 'confirmed';

  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirming(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming]);

  function toggle(ruleId: string, on: boolean) {
    void mutate(`safety-${ruleId}`, () => onToggleCheck(p.id, 'safety', ruleId, on)).then((result) => {
      if (!result) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError('');
      router.refresh();
    });
  }

  function confirmDeal() {
    void mutate('confirm-deal', () => onSetStatus(p.id, 'confirmed')).then((result) => {
      if (!result) return;
      if (!result.ok) {
        setConfirming(false);
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
      router.push(hrefFor('contract', p.id));
    });
  }

  if (!reachable) {
    return (
      <ScreenShell hrefFor={hrefFor}>
        <PropertyHeader property={p} phase="safety" hrefFor={hrefFor} />
        <div className="rc-card">
          <h2 className="rc-card-title">아직 계약 단계가 아니에요</h2>
          <p className="rc-card-sub">
            방문 기록을 저장한 뒤에 열립니다. 계약 전 안전 점검은 매물을 정한 다음에 하는 단계예요.
          </p>
          <div className="rc-form-actions">
            <Link
              href={hrefFor(p.status === 'ready' ? 'record' : 'confirm', p.id)}
              className="rc-btn rc-btn-primary"
            >
              {p.status === 'ready' ? '방문 기록 입력하기' : '정보 확인부터 하기'}
            </Link>
            <Link href={hrefFor('dash')} className="rc-btn rc-btn-ghost">
              매물 목록
            </Link>
          </div>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell hrefFor={hrefFor}>
      <PropertyHeader property={p} phase="safety" hrefFor={hrefFor} />

      <div className="rc-screen-only">
        <SaveStatus state={saveState} />
        <section className="rc-card">
          <h2 className="rc-card-title">
            계약 전 안전 점검 <SourceBadge kind="rule" />
          </h2>
          <p className="rc-card-sub">
            {p.dealType} 계약에서 서류·권리 관련으로 확인할 항목이에요. 방 상태가 아니라{' '}
            <b>내 보증금과 권리</b>를 지키는 단계입니다.
          </p>

          {/*
            빨간 '필수' 배지 + ⚠ 배너 조합은 "안 하면 문제가 있다"로 읽히기 쉽다.
            분류라는 사실이 코드 주석(lib/rules.ts SafetyRule.critical)에만 있었다 — 화면에 내놓는다.
            ★ 문구는 사용자가 확정한 것이다. 바꾸지 말 것 (R1 금칙어를 피해 작성됨).
          */}
          <p className="rc-notice">
            &lsquo;필수&rsquo;는 보증금·권리에 직접 걸리는 항목이라는 분류입니다. 확인하지 않았다고 해서
            문제가 있다는 뜻은 아닙니다.
          </p>

          {rules.map((r) => {
            const on = Boolean(p.safetyChecks[r.id]);
            return (
              <label key={r.id} className={`rc-chk-item${on ? ' rc-done' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={isBusy(`safety-${r.id}`)}
                  onChange={(e) => toggle(r.id, e.target.checked)}
                />
                <span>
                  <span className="rc-chk-t">
                    {r.title} {r.critical && <span className="rc-required">필수</span>}
                  </span>
                  <span className="rc-chk-d">{r.description}</span>
                </span>
              </label>
            );
          })}

          {missingCritical.length > 0 && (
            <p className="rc-notice rc-notice-warn">
              ⚠ 필수 항목 {missingCritical.length}개가 아직 확인되지 않았어요:{' '}
              {missingCritical.map((r) => r.title).join(' / ')}
            </p>
          )}
        </section>

        <section className="rc-card">
          <h2 className="rc-card-title">다음 단계</h2>
          <p className="rc-card-sub">
            점검표를 출력해 계약 현장에 들고 가거나, 확인을 마쳤다면 계약을 확정하세요.
          </p>
          <div className="rc-form-actions">
            <button type="button" className="rc-btn" onClick={() => window.print()}>
              최종 점검표 인쇄 / PDF
            </button>
            {p.status === 'recorded' && (
              <button
                type="button"
                className="rc-btn rc-btn-primary"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                계약 확정
              </button>
            )}
            <Link href={hrefFor('dash')} className="rc-btn rc-btn-ghost">
              나중에 하기 — 매물 목록
            </Link>
          </div>
        </section>

        {error && <p className="rc-error">{error}</p>}
      </div>

      {/* rc-screen-only — 모달을 연 채로 인쇄하면 점검표 위에 모달이 찍힌다 */}
      {confirming && (
        <div className="rc-modal-backdrop rc-screen-only" onClick={() => setConfirming(false)}>
          <div
            className="rc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rc-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="rc-confirm-title" className="rc-card-title">
              이 매물로 계약을 확정할까요?
            </h2>
            <p className="rc-card-sub">
              확정하면 비교 대상에서 빠지고 계약·입주 절차 화면으로 넘어갑니다. 나중에 취소할 수
              있어요.
            </p>

            {missingCritical.length > 0 && (
              <p className="rc-notice rc-notice-warn">
                아직 확인하지 않은 필수 항목이 {missingCritical.length}개 있어요:{' '}
                {missingCritical.map((r) => r.title).join(' / ')}
              </p>
            )}

            <div className="rc-form-actions">
              <button
                type="button"
                className="rc-btn rc-btn-primary"
                disabled={isBusy('confirm-deal')}
                onClick={confirmDeal}
              >
                {isBusy('confirm-deal') ? '처리하는 중...' : '계약 확정'}
              </button>
              <button
                type="button"
                className="rc-btn rc-btn-ghost"
                onClick={() => setConfirming(false)}
              >
                돌아가기
              </button>
            </div>
          </div>
        </div>
      )}

      <SafetyPrint property={p} />
    </ScreenShell>
  );
}
