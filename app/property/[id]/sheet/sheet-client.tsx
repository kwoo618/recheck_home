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
import type { ActionResult, DocumentDiffRow, PropertyDTO } from '@/lib/types';
import { hrefFor } from '@/app/_lib/nav';
import { askDiscrepancyQuestions, askQuestions } from '@/app/_lib/api-client';
import { useSheetMirror } from '@/app/_lib/use-sheet-mirror';

/** 조사지 만들기 화면의 클라이언트 경계 */
export function SheetClient({
  property,
  documentDiffs,
}: {
  property: PropertyDTO;
  documentDiffs: DocumentDiffRow[];
}) {
  // 연결이 끊겨도 /offline 에서 열 수 있게 사본을 둔다
  useSheetMirror(property);

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
      documentDiffs={documentDiffs}
      onAskDiscrepancy={askDiscrepancyQuestions}
    />
  );
}
