'use client';

import { setStatus } from '@/lib/actions/properties';
import { setCheckChoice, toggleCheck } from '@/lib/actions/checks';
import { SafetyScreen } from '@/components/screens/safety-screen';
import type { ContractCheckData } from '@/lib/documents/contract-checks';
import type { PropertyDTO } from '@/lib/types';
import { hrefFor } from '@/app/_lib/nav';

/** 계약 전 안전 점검 화면의 클라이언트 경계 */
export function SafetyClient({ property, contract }: { property: PropertyDTO; contract: ContractCheckData }) {
  return (
    <SafetyScreen
      property={property}
      contract={contract}
      hrefFor={hrefFor}
      onToggleCheck={toggleCheck}
      onSetChoice={setCheckChoice}
      onSetStatus={setStatus}
    />
  );
}
