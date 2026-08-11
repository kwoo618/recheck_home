'use client';

import { saveVisitResults } from '@/lib/actions/visit';
import { saveAnswers } from '@/lib/actions/questions';
import { VisitRecordScreen } from '@/components/screens/visit-record-screen';
import type { PropertyDTO } from '@/lib/types';
import { hrefFor } from '@/app/_lib/nav';

/** 방문 기록 화면의 클라이언트 경계 */
export function RecordClient({
  property,
  activeCount,
}: {
  property: PropertyDTO;
  activeCount: number;
}) {
  return (
    <VisitRecordScreen
      property={property}
      hrefFor={hrefFor}
      onSaveVisitResults={saveVisitResults}
      onSaveAnswers={saveAnswers}
      activeCount={activeCount}
    />
  );
}
