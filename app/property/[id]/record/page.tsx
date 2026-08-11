import { notFound } from 'next/navigation';
import { getProperty, listActiveProperties } from '@/lib/actions/properties';
import { withoutAddressDetail } from '@/app/_lib/property';
import { RecordClient } from './record-client';

/**
 * 방문 기록 (PRD §5.5 · §7.5) — 국면 B.
 *
 * 저장 후 어디로 보낼지는 활성 매물 수에 달려 있다(2건 이상이면 비교).
 * 그 판단에 필요한 수치는 서버에서 세어 내려준다 — 화면이 전체 목록을 받을 이유가 없다.
 */
export default async function VisitRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [property, active] = await Promise.all([getProperty(id), listActiveProperties()]);
  if (!property) notFound();

  return <RecordClient property={withoutAddressDetail(property)} activeCount={active.length} />;
}
