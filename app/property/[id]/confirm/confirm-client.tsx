'use client';

import { updateProperty, deleteProperty } from '@/lib/actions/properties';
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
      /*
       * 삭제 진입점. 넘기지 않으면 화면이 버튼을 그리지 않는다.
       * 매물이 1건일 때는 '제외'도 쓸 수 없어(비교는 활성 2건부터) 잘못 등록한 매물을
       * 지울 방법이 하나도 없었다. 자식 행은 FK ON DELETE CASCADE로 함께 지워진다.
       */
      onDelete={deleteProperty}
      renderMapPreview={renderMapPreview}
    />
  );
}
