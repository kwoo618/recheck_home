'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CONTRACT_DAY, selectAfterSteps, type RuleContext } from '@/lib/rules';
import type { ActionResult, PropertyDTO } from '@/lib/types';
import type { CheckGroup } from '@/lib/actions/checks';
import { ScreenShell } from './_parts/screen-shell';
import { PropertyHeader } from './_parts/property-header';
import { SourceBadge } from './_parts/source-badge';
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
};

export function ContractScreen({ property: p, hrefFor, onToggleCheck }: ContractScreenProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const ctx: RuleContext = {
    dealType: p.dealType,
    age: p.age,
    heating: p.heating,
    floor: p.floor,
    deposit: p.deposit,
  };
  const afterGroups = selectAfterSteps(ctx);

  function toggle(group: CheckGroup, ruleId: string, on: boolean) {
    startTransition(async () => {
      const result = await onToggleCheck(p.id, group, ruleId, on);
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
                  disabled={pending}
                  onChange={(e) => toggle('contract', c.id, e.target.checked)}
                />
                <span className="rc-chk-t">{c.title}</span>
              </label>
            );
          })}
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
                    disabled={pending}
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
      </div>
    </ScreenShell>
  );
}
