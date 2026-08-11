'use client';

import { setStatus, updateProperty } from '@/lib/actions/properties';
import { addVisitCheck, removeVisitCheck } from '@/lib/actions/visit';
import {
  toggleBankQuestion,
  addQuestion,
  editQuestion,
  removeQuestion,
} from '@/lib/actions/questions';
import { SurveySheetScreen } from '@/components/screens/survey-sheet-screen';
import type { ActionResult, PropertyDTO } from '@/lib/types';
import { hrefFor } from '@/app/_lib/nav';
import { askQuestions } from '@/app/_lib/api-client';

/** 조사지 만들기 화면의 클라이언트 경계 */
export function SheetClient({ property }: { property: PropertyDTO }) {
  // 화면은 "걱정 없음"만 저장하면 되고, updateProperty의 나머지 필드는 알 필요가 없다.
  const setNoConcern = (propertyId: string, noConcern: boolean): Promise<ActionResult<void>> =>
    updateProperty(propertyId, { noConcern });

  return (
    <SurveySheetScreen
      property={property}
      hrefFor={hrefFor}
      onToggleBankQuestion={toggleBankQuestion}
      onAddQuestion={addQuestion}
      onEditQuestion={editQuestion}
      onRemoveQuestion={removeQuestion}
      onAddVisitCheck={addVisitCheck}
      onRemoveVisitCheck={removeVisitCheck}
      onSetNoConcern={setNoConcern}
      onSetStatus={setStatus}
      onAskQuestions={askQuestions}
    />
  );
}
