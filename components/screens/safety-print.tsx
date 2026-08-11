'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { CONTRACT_DAY, selectSafetyRules, type RuleContext } from '@/lib/rules';
import { formatDistanceLabel } from '@/lib/geo';
import type { PropertyDTO } from '@/lib/types';
import { formatPrice } from './_parts/format';

/**
 * 계약 전 최종 점검표 인쇄 (프로토타입 printSafety)
 *
 * 안전 점검 화면과 계약 후 화면이 함께 쓴다. 프로토타입에서도 두 화면이 같은 함수를 불렀다.
 *
 * ★ 서류·권리 항목은 체크 상태를 반영해 출력한다(✔/☐). 계약 당일 항목은 현장에서
 *   확인하는 것이라 항상 빈 칸(☐)으로 낸다.
 * ★ 주소·거리는 넣되 상세주소는 넣지 않는다. (R7)
 */
export function SafetyPrint({ property: p }: { property: PropertyDTO }) {
  const [printedAt, setPrintedAt] = useState('');
  useEffect(() => {
    const stamp = () => flushSync(() => setPrintedAt(new Date().toLocaleDateString('ko-KR')));
    window.addEventListener('beforeprint', stamp);
    return () => window.removeEventListener('beforeprint', stamp);
  }, []);

  const ctx: RuleContext = {
    dealType: p.dealType,
    age: p.age,
    heating: p.heating,
    floor: p.floor,
    deposit: p.deposit,
  };
  const rules = selectSafetyRules(ctx);

  return (
    <div className="rc-print-only rc-print">
      <h1>계약 전 최종 점검표 — {p.name}</h1>
      <p className="rc-pmeta">
        {formatPrice(p)} · {p.dealType}
        {p.address && <> · {p.address}</>}
        <br />
        {formatDistanceLabel(p.distanceFromSchool)}
        {printedAt && <> · 리:체크 출력 {printedAt}</>}
      </p>

      <h2>서류·권리 점검</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width: '6%' }}>확인</th>
            <th style={{ width: '44%' }}>항목</th>
            <th>내용</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center' }}>{p.safetyChecks[r.id] ? '✔' : '☐'}</td>
              <td>
                {r.critical && '[필수] '}
                {r.title}
              </td>
              <td>{r.description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>계약 당일 확인</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width: '6%' }}>확인</th>
            <th>항목</th>
          </tr>
        </thead>
        <tbody>
          {CONTRACT_DAY.map((c) => (
            <tr key={c.id}>
              <td style={{ textAlign: 'center' }}>☐</td>
              <td>{c.title}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="rc-foot">
        ※ 본 점검표는 확인을 돕는 참고 자료이며, 계약 여부의 판단과 책임은 계약 당사자 본인에게
        있습니다.
      </p>
    </div>
  );
}
