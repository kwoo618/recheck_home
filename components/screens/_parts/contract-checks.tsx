'use client';

import { useState } from 'react';
import { compareValues } from '@/lib/compare/compare';
import { findPair } from '@/lib/compare/pairs';
import { discrepancySentence, josa, STATUS_LABEL } from '@/lib/compare/text';
import { FIELD_SPECS } from '@/lib/documents/fields';
import type { ContractCheckData } from '@/lib/documents/contract-checks';
import {
  AGENT_DOCUMENTS,
  CONTRACT_CHOICES,
  readContractChoice,
  selectContractChecks,
  specialTermsSentence,
  type ContractCheckRule,
  type ContractChoiceId,
} from '@/lib/rules';
import { SourceBadge } from './source-badge';

/**
 * 계약서 확인 항목 (V2-PLAN §4-6) — 안전 점검 화면의 계약서 섹션
 *
 * ★ 항목·문구는 lib/rules.ts CONTRACT_CHECK_RULES 가 단일 소스다.
 * ★ 존재·확인 여부만 묻는다. 체크는 사용자만 한다 — 대조 결과·추출 값은 옆에 보여 줄 뿐이다 (R1).
 * ★ 특약은 원문이 아니라 키워드 매칭 결과만 받는다 (R7). 이 섹션은 rc-screen-only 안에 있어 인쇄되지 않는다.
 * ★ 이사 날짜는 비교에만 쓰고 저장하지 않는다.
 */

type Props = {
  data: ContractCheckData;
  checks: Record<string, boolean>;
  isBusy: (key: string) => boolean;
  onToggle: (id: string, on: boolean) => void;
  onChoice: (ruleId: string, choice: ContractChoiceId | null) => void;
};

const fieldLabel = (key: string) => FIELD_SPECS.find((s) => s.key === key)?.label ?? key;

const NO_CONTRACT = '저장된 계약서가 없습니다 — 계약서에서 직접 확인하세요.';

function CompareLink({ rule, data }: { rule: ContractCheckRule; data: ContractCheckData }) {
  if (rule.link.kind !== 'compare') return null;
  const rows = rule.link.pairs.flatMap((p) => {
    const d = data.discrepancies.find((x) => x.fieldKey === p.fieldKey && x.docA === p.docA && x.docB === p.docB);
    const pair = findPair(p.fieldKey, p.docA, p.docB);
    return d && pair ? [{ d, pair }] : [];
  });
  if (rows.length === 0) {
    return (
      <p className="rc-field-note">
        연결할 대조 결과가 없습니다 — 문서를 올려 대조하면 여기에 나란히 보입니다. 지금은 직접 확인하세요.
      </p>
    );
  }
  return (
    <>
      {rows.map(({ d, pair }) => (
        <p key={d.id} className="rc-field-note">
          <b>
            {pair.label} · {STATUS_LABEL[d.status]}
          </b>{' '}
          {discrepancySentence(pair, d.valueA, d.valueB, d.status)}
        </p>
      ))}
    </>
  );
}

function FieldsLink({ rule, data }: { rule: ContractCheckRule; data: ContractCheckData }) {
  if (rule.link.kind !== 'fields') return null;
  if (!data.hasContract) return <p className="rc-field-note">{NO_CONTRACT}</p>;
  return (
    <p className="rc-field-note">
      계약서에서 찾은 값:{' '}
      {rule.link.keys
        .map((k) => `${fieldLabel(k)} ${data.fields[k] === null || data.fields[k] === undefined ? '— 찾지 못함' : `[${data.fields[k]}]`}`)
        .join(' · ')}
    </p>
  );
}

/** 잔금일 ↔ 이사 날짜. 날짜 비교는 lib/compare 의 순수 함수가 한다 (R2) */
function MoveInCompare({ balanceDate }: { balanceDate: string | null }) {
  const [moveIn, setMoveIn] = useState('');
  let result: string | null = null;
  if (moveIn && balanceDate !== null) {
    const status = compareValues('date', balanceDate, moveIn);
    const both = `계약서 잔금일 ${josa(`[${balanceDate}]`, '과/와')} 입력한 이사 날짜 ${josa(`[${moveIn}]`, '은/는')}`;
    result =
      status === 'same'
        ? `${both} 같은 날짜입니다.`
        : status === 'different'
          ? `${both} 다른 날짜입니다.`
          : `계약서 잔금일 표기 ${josa(`[${balanceDate}]`, '은/는')} 날짜로 읽지 못했습니다. 입력한 이사 날짜 [${moveIn}]와 나란히 보고 확인하세요.`;
  }
  return (
    <div className="rc-field-note">
      <label>
        이사(입주) 날짜{' '}
        <input type="date" className="rc-input" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
      </label>
      {balanceDate === null && moveIn && <p>계약서 잔금일을 찾지 못해 비교하지 않았습니다. 계약서에서 직접 확인하세요.</p>}
      {result && <p>{result}</p>}
      <p>입력한 날짜는 저장하지 않습니다.</p>
    </div>
  );
}

function CheckRow({
  id,
  title,
  hint,
  checks,
  isBusy,
  onToggle,
}: {
  id: string;
  title: string;
  hint: string | null;
} & Pick<Props, 'checks' | 'isBusy' | 'onToggle'>) {
  const on = Boolean(checks[id]);
  return (
    <label className={`rc-chk-item${on ? ' rc-done' : ''}`}>
      <input
        type="checkbox"
        checked={on}
        disabled={isBusy(`safety-${id}`)}
        onChange={(e) => onToggle(id, e.target.checked)}
      />
      <span className="rc-chk-body">
        <span className="rc-chk-t">{title}</span>
        {hint && <span className="rc-chk-d">직접 확인: {hint}</span>}
      </span>
    </label>
  );
}

export function ContractChecks({ data, checks, isBusy, onToggle, onChoice }: Props) {
  const rules = selectContractChecks(data.agentFlag);

  return (
    <section className="rc-card">
      <h2 className="rc-card-title">
        계약서 확인 항목 <SourceBadge kind="rule" />
      </h2>
      <p className="rc-card-sub">
        계약서에 무엇이 적혀 있는지 확인할 항목이에요. 문서를 올려 대조했다면 그 결과를 옆에 보여 주고, 체크는 직접
        합니다.
      </p>

      {rules.map((r) => {
        if (r.input === 'agent-docs') {
          return (
            <div key={r.id} className="rc-q-item">
              <h3 className="rc-group-label">{r.title}</h3>
              <p className="rc-field-note">계약서에 대리인 계약으로 적혀 있어 보이는 항목입니다.</p>
              {AGENT_DOCUMENTS.map((doc) => (
                <CheckRow key={doc.id} id={doc.id} title={doc.label} hint={null} {...{ checks, isBusy, onToggle }} />
              ))}
            </div>
          );
        }

        if (r.input === 'choice') {
          const current = readContractChoice(checks, r.id);
          const busyKey = `choice-${r.id}`;
          return (
            <div key={r.id} className="rc-q-item">
              <h3 className="rc-group-label">{r.title}</h3>
              <div className="rc-seg" role="group" aria-label={r.title}>
                {CONTRACT_CHOICES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={current === c.id ? 'rc-on' : ''}
                    aria-pressed={current === c.id}
                    disabled={isBusy(busyKey)}
                    onClick={() => onChoice(r.id, current === c.id ? null : c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div key={r.id}>
            <CheckRow id={r.id} title={r.title} hint={r.userCheck} {...{ checks, isBusy, onToggle }} />
            <CompareLink rule={r} data={data} />
            <FieldsLink rule={r} data={data} />
            {r.link.kind === 'terms' && (
              <p className="rc-field-note">{specialTermsSentence(data.terms[r.link.group], r.link.group)}</p>
            )}
            {r.id === 'k-balance-date' && <MoveInCompare balanceDate={data.fields.balance_date ?? null} />}
          </div>
        );
      })}

      <p className="rc-field-note">
        특약 문구는 정해 둔 낱말을 그대로 찾아본 결과입니다. 낱말이 보여도 조항 내용은 다를 수 있고, 보이지 않아도
        다른 말로 적혀 있을 수 있습니다.
      </p>
    </section>
  );
}
