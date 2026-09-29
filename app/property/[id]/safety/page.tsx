import { notFound } from 'next/navigation';
import { getProperty } from '@/lib/actions/properties';
import { listDocuments } from '@/lib/actions/documents';
import { listDiscrepancies } from '@/lib/actions/compare';
import { withoutAddressDetail } from '@/app/_lib/property';
import {
  buildContractCheckData,
  EMPTY_CONTRACT_CHECK_DATA,
  type ContractCheckData,
} from '@/lib/documents/contract-checks';
import { SafetyClient } from './safety-client';

/**
 * 계약 전 안전 점검 (PRD §5.7 · §7.7) — 국면 C.
 *
 * 방이 아니라 보증금과 권리를 지키는 단계다.
 * 필수/추천 분류는 lib/rules.ts의 critical 플래그가 정한다 — 분류이지 판정이 아니다.
 *
 * 계약서 확인 항목(V2-PLAN §4-6)의 자동 채움 자료는 여기서 만든다. 특약 원문은 서버에서
 * 키워드 매칭만 하고 화면에 넘기지 않는다 (R7). 문서를 못 읽으면 빈 자료 — 사용자 확인만으로 동작한다.
 */
export default async function SafetyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getProperty(id);
  if (!property) notFound();

  let contract: ContractCheckData = EMPTY_CONTRACT_CHECK_DATA;
  try {
    const [documents, discrepancies] = await Promise.all([listDocuments(id), listDiscrepancies(id)]);
    contract = buildContractCheckData(documents, discrepancies);
  } catch {
    // 문서·대조 결과 없이도 계약서 항목은 사용자 확인으로 쓸 수 있다
  }

  return <SafetyClient property={withoutAddressDetail(property)} contract={contract} />;
}
