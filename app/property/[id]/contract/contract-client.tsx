'use client';

import { setStatus } from '@/lib/actions/properties';
import { toggleCheck } from '@/lib/actions/checks';
import { ContractScreen } from '@/components/screens/contract-screen';
import type { PropertyDTO } from '@/lib/types';
import { hrefFor } from '@/app/_lib/nav';

/**
 * 계약 확정 후 절차 화면의 클라이언트 경계.
 *
 * onSetStatus는 확정 취소(confirmed → recorded) 경로다.
 * 서버는 이 전이를 허용하는데(ALLOWED_TRANSITIONS.confirmed = ['recorded'])
 * 화면에서 부르는 곳이 없으면 잘못 확정한 매물이 영구히 비교에서 빠진다.
 * 전이 허용 여부 판단은 여기가 아니라 canTransition()이 한다.
 */
export function ContractClient({ property }: { property: PropertyDTO }) {
  return (
    <ContractScreen
      property={property}
      hrefFor={hrefFor}
      onToggleCheck={toggleCheck}
      onSetStatus={setStatus}
    />
  );
}
