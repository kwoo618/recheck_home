'use client';

import { saveVisitResults, type VisitResultInput } from '@/lib/actions/visit';
import { saveAnswers } from '@/lib/actions/questions';
import { supersedeQueued } from '@/lib/client/offline';
import { VisitRecordScreen } from '@/components/screens/visit-record-screen';
import type { PropertyDTO } from '@/lib/types';
import { hrefFor } from '@/app/_lib/nav';
import { useSheetMirror } from '@/app/_lib/use-sheet-mirror';

/** 방문 기록 화면의 클라이언트 경계 */
export function RecordClient({
  property,
  activeCount,
}: {
  property: PropertyDTO;
  activeCount: number;
}) {
  // 연결이 끊겨도 /offline 에서 열 수 있게 사본을 둔다
  useSheetMirror(property);

  /*
   * 온라인 저장이 성공하면, 그보다 먼저 이 기기 큐에 쌓인 같은 항목을 치운다.
   * 치우지 않으면 나중에 옛 오프라인 값이 방금 저장한 값을 덮어쓴다 (마지막 저장 우선).
   */
  const onSaveVisitResults = async (propertyId: string, results: VisitResultInput[]) => {
    const at = Date.now();
    const saved = await saveVisitResults(propertyId, results);
    if (saved.ok) await supersedeQueued(propertyId, results.map((r) => r.id), at);
    return saved;
  };

  return (
    <VisitRecordScreen
      property={property}
      hrefFor={hrefFor}
      onSaveVisitResults={onSaveVisitResults}
      onSaveAnswers={saveAnswers}
      activeCount={activeCount}
    />
  );
}
