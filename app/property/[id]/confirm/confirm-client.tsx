'use client';

import { updateProperty } from '@/lib/actions/properties';
import { PropertyConfirmScreen } from '@/components/screens/property-confirm-screen';
import type { PropertyDTO } from '@/lib/types';
import { hrefFor } from '@/app/_lib/nav';
import { geocode } from '@/app/_lib/api-client';
import { renderMapPreview } from '@/app/_lib/map-preview';

/** 정보 확인·수정 화면의 클라이언트 경계 (일반 함수는 서버→클라이언트로 넘길 수 없다) */
export function ConfirmClient({ property }: { property: PropertyDTO }) {
  return (
    <PropertyConfirmScreen
      property={property}
      hrefFor={hrefFor}
      onUpdate={updateProperty}
      onGeocode={geocode}
      renderMapPreview={renderMapPreview}
    />
  );
}
