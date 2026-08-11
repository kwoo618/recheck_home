'use client';

import type { ReactNode } from 'react';
import { setStatus } from '@/lib/actions/properties';
import { addQuestion } from '@/lib/actions/questions';
import { saveFinance } from '@/lib/actions/checks';
import { CompareScreen } from '@/components/screens/compare-screen';
import type { PropertyDTO } from '@/lib/types';
import type { FinanceProfile } from '@/db/schema';
import { hrefFor } from '@/app/_lib/nav';
import { summarize } from '@/app/_lib/api-client';

/** 매물 비교 화면의 클라이언트 경계 (일반 함수는 서버→클라이언트로 넘길 수 없다) */
export function CompareClient({
  properties,
  finance,
  map,
}: {
  properties: PropertyDTO[];
  finance: FinanceProfile;
  map: ReactNode;
}) {
  return (
    <CompareScreen
      properties={properties}
      hrefFor={hrefFor}
      finance={finance}
      onSaveFinance={saveFinance}
      onAddQuestion={addQuestion}
      onSetStatus={setStatus}
      onSummarize={summarize}
      map={map}
    />
  );
}
