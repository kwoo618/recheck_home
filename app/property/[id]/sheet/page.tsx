import { notFound } from 'next/navigation';
import { getProperty } from '@/lib/actions/properties';
import { listDiscrepancies } from '@/lib/actions/compare';
import { QUESTION_STATUSES } from '@/lib/compare/text';
import { withoutAddressDetail } from '@/app/_lib/property';
import { SheetClient } from './sheet-client';

/**
 * 조사지 만들기 (PRD §5.3 · §7.4) — 국면 A.
 *
 * ★ R5: 여기서는 "확인할 목록"만 만든다. 현장 항목 체크는 방문 후(국면 B)에 한다.
 * 인쇄용 레이아웃은 화면 안에 함께 있고 window.print()로 띄운다(별도 라우트 없음).
 */
export default async function SurveySheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getProperty(id);
  if (!property) notFound();

  // 문서 대조에서 질문으로 바꾸는 행만 (V2-PLAN §4-2). 조사지는 인쇄되므로 값(성명·금액)은 넘기지 않는다
  const documentDiffs = (await listDiscrepancies(id))
    .filter((d) => QUESTION_STATUSES.includes(d.status))
    .map(({ id: diffId, fieldKey, docA, docB, status }) => ({ id: diffId, fieldKey, docA, docB, status }));

  return <SheetClient property={withoutAddressDetail(property)} documentDiffs={documentDiffs} />;
}
