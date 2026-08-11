'use client';

import { setStatus } from '@/lib/actions/properties';
import { toggleCheck } from '@/lib/actions/checks';
import { SafetyScreen } from '@/components/screens/safety-screen';
import type { PropertyDTO } from '@/lib/types';
import { hrefFor } from '@/app/_lib/nav';

/** 계약 전 안전 점검 화면의 클라이언트 경계 */
export function SafetyClient({ property }: { property: PropertyDTO }) {
  return (
    <SafetyScreen
      property={property}
      hrefFor={hrefFor}
      onToggleCheck={toggleCheck}
      onSetStatus={setStatus}
    />
  );
}
