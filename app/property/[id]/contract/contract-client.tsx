'use client';

import { toggleCheck } from '@/lib/actions/checks';
import { ContractScreen } from '@/components/screens/contract-screen';
import type { PropertyDTO } from '@/lib/types';
import { hrefFor } from '@/app/_lib/nav';

/** 계약 확정 후 절차 화면의 클라이언트 경계 */
export function ContractClient({ property }: { property: PropertyDTO }) {
  return <ContractScreen property={property} hrefFor={hrefFor} onToggleCheck={toggleCheck} />;
}
