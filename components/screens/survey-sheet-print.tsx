'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { formatDistanceLabel } from '@/lib/geo';
import type { PropertyDTO } from '@/lib/types';
import { formatSpecLine } from './_parts/format';

/**
 * ④ 조사지 인쇄 (프로토타입 printSheet)
 *
 * 화면에는 보이지 않고 인쇄할 때만 나타난다. 프로토타입은 문서 밖의 #print-area 에 그렸지만,
 * 여기서는 rc-print-only 로 화면 안에서 자립한다.
 *
 * ★ 결과 칸은 비워서 인쇄한다. 현장에서 손으로 적어오는 종이다. (R5 — 체크는 방문 후)
 * ★ 주소와 거리는 넣되 상세주소(동/호수)는 넣지 않는다. (R7)
 */
export function SurveySheetPrint({ property: p }: { property: PropertyDTO }) {
  /*
   * 출력일은 실제로 인쇄를 누른 순간에 만든다.
   *   · 서버에서 렌더하면 배포 서버 시간대(UTC) 기준이라 새벽에는 날짜가 하루 어긋난다.
   *   · beforeprint 는 버튼 인쇄와 Ctrl+P 둘 다에서 뜬다.
   *   · flushSync 로 즉시 반영하지 않으면 첫 인쇄물에 날짜가 빠질 수 있다.
   */
  const [printedAt, setPrintedAt] = useState('');
  useEffect(() => {
    const stamp = () => flushSync(() => setPrintedAt(new Date().toLocaleDateString('ko-KR')));
    window.addEventListener('beforeprint', stamp);
    return () => window.removeEventListener('beforeprint', stamp);
  }, []);

  return (
    <div className="rc-print-only rc-print">
      <h1>방문 조사지 — {p.name}</h1>
      <p className="rc-pmeta">
        {formatSpecLine(p)}
        {p.address && <> · {p.address}</>}
        <br />
        {formatDistanceLabel(p.distanceFromSchool)}
        {printedAt && <> · 리:체크 출력 {printedAt}</>}
      </p>

      <h2>직접 확인할 것</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width: '44%' }}>항목</th>
            <th>좋음</th>
            <th>보통</th>
            <th>문제</th>
            <th style={{ width: '30%' }}>메모</th>
          </tr>
        </thead>
        <tbody>
          {p.visitChecks.length === 0 ? (
            <tr>
              <td colSpan={5}>확인 항목 없음</td>
            </tr>
          ) : (
            p.visitChecks.map((v) => (
              <tr key={v.id}>
                <td>
                  [{v.category}] {v.title}
                </td>
                <td />
                <td />
                <td />
                <td />
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h2>중개사에게 물어볼 것</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width: '55%' }}>질문</th>
            <th>받은 답변</th>
          </tr>
        </thead>
        <tbody>
          {p.questions.length === 0 ? (
            <tr>
              <td colSpan={2}>별도 질문 없음</td>
            </tr>
          ) : (
            p.questions.map((q, i) => (
              <tr key={q.id}>
                <td>
                  Q{i + 1}. {q.text}
                </td>
                <td className="rc-blank" />
              </tr>
            ))
          )}
        </tbody>
      </table>

      <p className="rc-foot">
        ※ 이 조사지는 확인을 돕는 참고 자료이며, 계약 판단은 본인의 몫입니다. 다녀온 뒤 리:체크에
        결과를 입력하면 매물 비교에 활용됩니다.
      </p>
    </div>
  );
}
