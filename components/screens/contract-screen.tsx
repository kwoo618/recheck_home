'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PropertyStatus } from '@/db/schema';
import { CONTRACT_DAY, selectAfterSteps, type RuleContext } from '@/lib/rules';
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
 * ⑧ 계약 확정 후 — 계약 당일 체크리스트 + 이후 절차 (프로토타입 viewContract)
 *
 * ★ 절차 항목은 lib/rules.ts 가 단일 소스다. 프로토타입은 9개였고 a10(입주 전 하자 사진)·
 *   a11(반환보증 가입 실행)이 없었다. 여기서는 11개 전부를 쓴다.
 * ★ 거래유형 분기를 화면에서 하지 않는다. 프로토타입은 a5 를 하드코딩으로 걸렀지만
 *   조건은 selectAfterSteps() 안에 있다. 규칙을 두 곳에 두면 한쪽만 바뀐다.
 */
export type ContractScreenProps = {
  property: PropertyDTO;
  hrefFor: HrefFor;
  /** Server Action toggleCheck(propertyId, group, ruleId, on) */
  onToggleCheck: (
    propertyId: string,
    group: CheckGroup,
    ruleId: string,
    on: boolean,
  ) => Promise<ActionResult<void>>;
  /**
   * 확정 취소 (confirmed → recorded). 넘기지 않으면 취소 버튼을 그리지 않는다.
   * 계약을 확정하면 비교에서 빠지는데, 되돌릴 길이 없으면 잘못 누른 사람이 갇힌다.
   * 전이 자체는 canTransition 이 허용하는 것이고 검증은 서버가 한다.
   */
  onSetStatus?: (propertyId: string, next: PropertyStatus) => Promise<ActionResult<void>>;
};

export function ContractScreen({ property: p, hrefFor, onToggleCheck, onSetStatus }: ContractScreenProps) {
  const router = useRouter();
  const { run: mutate, isBusy, busy, saveState } = useMutations();
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const ctx: RuleContext = {
    dealType: p.dealType,
    age: p.age,
    heating: p.heating,
    floor: p.floor,
    deposit: p.deposit,
  };
  const afterGroups = selectAfterSteps(ctx);

  function toggle(group: CheckGroup, ruleId: string, on: boolean) {
    void mutate(`${group}-${ruleId}`, () => onToggleCheck(p.id, group, ruleId, on)).then((result) => {
      if (!result) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError('');
      router.refresh();
    });
  }

  return (
    <ScreenShell hrefFor={hrefFor}>
      <PropertyHeader property={p} phase="contract" hrefFor={hrefFor} />

      <div className="rc-screen-only">
        <SaveStatus state={saveState} />
        <section className="rc-card">
          <h2 className="rc-card-title">
            계약 당일 체크리스트 <SourceBadge kind="rule" />
          </h2>
          <p className="rc-card-sub">계약서에 서명하기 전, 현장에서 마지막으로 확인하세요.</p>

          {CONTRACT_DAY.map((c) => {
            const on = Boolean(p.contractChecks[c.id]);
            return (
              <label key={c.id} className={`rc-chk-item${on ? ' rc-done' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={isBusy(`contract-${c.id}`)}
                  onChange={(e) => toggle('contract', c.id, e.target.checked)}
                />
                <span className="rc-chk-t">{c.title}</span>
              </label>
            );
          })}

          {/* 인쇄물은 안전 점검 화면과 같은 것을 쓴다 (프로토타입도 printSafety 하나를 공유했다) */}
          <div className="rc-form-actions">
            <button type="button" className="rc-btn rc-btn-sm rc-btn-ghost" onClick={() => window.print()}>
              점검표 인쇄 / PDF
            </button>
          </div>
        </section>

        {afterGroups.map((group) => (
          <section key={group.phase} className="rc-card">
            <h2 className="rc-card-title">
              {group.phase} <SourceBadge kind="rule" />
            </h2>
            {group.items.map((item) => {
              const on = Boolean(p.afterChecks[item.id]);
              return (
                <label key={item.id} className={`rc-chk-item${on ? ' rc-done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={isBusy(`after-${item.id}`)}
                    onChange={(e) => toggle('after', item.id, e.target.checked)}
                  />
                  <span className="rc-chk-t">{item.title}</span>
                </label>
              );
            })}
          </section>
        ))}

        {error && <p className="rc-error">{error}</p>}

        <p className="rc-notice">
          전입신고와 확정일자는 보증금 보호(대항력·우선변제권)의 핵심이에요. 입주 당일 바로 처리하는
          것을 권장합니다.
        </p>

        {/* 확정하면 비교에서 빠지므로, 잘못 눌렀을 때 되돌아갈 길을 아래쪽에도 둔다 */}
        <div className="rc-next-step">
          <Link href={hrefFor('dash')} className="rc-btn rc-btn-ghost">
            매물 목록
          </Link>
          {onSetStatus && p.status === 'confirmed' && (
            <button
              type="button"
              className="rc-btn rc-btn-ghost rc-btn-danger"
              disabled={busy}
              onClick={() => setCancelling(true)}
            >
              계약 확정 취소
            </button>
          )}
        </div>
      </div>

      {cancelling && onSetStatus && (
        <div className="rc-modal-backdrop rc-screen-only" onClick={() => setCancelling(false)}>
          <div
            className="rc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rc-cancel-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="rc-cancel-title" className="rc-card-title">
              계약 확정을 취소할까요?
            </h2>
            <p className="rc-card-sub">
              기록 완료 상태로 돌아가고 다시 비교 대상이 됩니다. 지금까지 체크한 계약 당일·이후 절차
              항목은 그대로 남아요.
            </p>
            <div className="rc-form-actions">
              <button
                type="button"
                className="rc-btn rc-btn-danger"
                disabled={isBusy('cancel-deal')}
                onClick={() => {
                  void mutate('cancel-deal', () => onSetStatus(p.id, 'recorded')).then((result) => {
                    if (!result) return;
                    if (!result.ok) {
                      setCancelling(false);
                      setError(result.error);
                      return;
                    }
                    setCancelling(false);
                    router.refresh();
                    router.push(hrefFor('safety', p.id));
                  });
                }}
              >
                {isBusy('cancel-deal') ? '처리하는 중...' : '확정 취소'}
              </button>
              <button type="button" className="rc-btn rc-btn-ghost" onClick={() => setCancelling(false)}>
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
