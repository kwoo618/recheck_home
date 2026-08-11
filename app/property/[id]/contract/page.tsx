import { notFound } from 'next/navigation';
import { getProperty } from '@/lib/actions/properties';
import { withoutAddressDetail } from '@/app/_lib/property';
import { ContractClient } from './contract-client';

/**
 * 계약 당일 · 계약 후 절차 (PRD §5.8 · §7.7) — 국면 C.
 * 항목 선정은 lib/rules.ts가 하고, 화면은 체크 상태만 저장한다.
 */
export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getProperty(id);
  if (!property) notFound();

  return <ContractClient property={withoutAddressDetail(property)} />;
}
