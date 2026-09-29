'use client';

import { formatDistanceLabel } from '@/lib/geo';
import type { PropertyDTO } from '@/lib/types';
import { RESULT_CHOICES, formatSpecLine, resultLabel } from './_parts/format';
import { usePrintDocument } from './_parts/use-print-document';

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
  // 출력일과 PDF 저장 파일명(SealookHomes_조사지_{매물명}_{날짜})을 인쇄 시점에 만든다
  const printedAt = usePrintDocument('조사지', p.name);

  return (
    <div className="rc-print-only rc-print">
      <h1>방문 조사지 — {p.name}</h1>
      <p className="rc-pmeta">
        {formatSpecLine(p)}
        {p.address && <> · {p.address}</>}
        <br />
        {formatDistanceLabel(p.distanceFromSchool)}
        {printedAt && <> · 씰룩홈즈 출력{printedAt}</>}
      </p>

      {/*
        결과 열은 화면의 4택(RESULT_CHOICES)과 같은 배열에서 만든다.
        전에는 좋음·보통·문제 3열뿐이라 "확인 못 했다"를 적을 칸이 없었고, 빈칸으로 적어오면
        화면에서 '미확인'(진행률에 반영)과 미입력(반영 안 됨)을 구분해 옮길 수 없었다.
        늘어난 한 열은 메모 폭(30% → 24%)에서 가져온다 — 손으로 짧은 메모를 적기에는 충분하다.
      */}
      <h2>직접 확인할 것</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width: '36%' }}>항목</th>
            {RESULT_CHOICES.map((choice) => (
              <th key={choice} style={{ width: '10%' }}>
                {resultLabel(choice)}
              </th>
            ))}
            <th style={{ width: '24%' }}>메모</th>
          </tr>
        </thead>
        <tbody>
          {p.visitChecks.length === 0 ? (
            <tr>
              <td colSpan={RESULT_CHOICES.length + 2}>확인 항목 없음</td>
            </tr>
          ) : (
            p.visitChecks.map((v) => (
              <tr key={v.id}>
                <td>
                  [{v.category}] {v.title}
                </td>
                {RESULT_CHOICES.map((choice) => (
                  <td key={choice} />
                ))}
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
        ※ 이 조사지는 확인을 돕는 참고 자료이며, 계약 판단은 본인의 몫입니다. 다녀온 뒤 씰룩홈즈에
        결과를 입력하면 매물 비교에 활용됩니다.
      </p>
    </div>
  );
}
