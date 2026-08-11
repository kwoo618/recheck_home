'use client';

import { createProperty } from '@/lib/actions/properties';
import { PropertyAddScreen } from '@/components/screens/property-add-screen';
import { hrefFor } from '@/app/_lib/nav';
import { geocode, parseText } from '@/app/_lib/api-client';

/**
 * 매물 등록 화면의 클라이언트 경계.
 *
 * 왜 page.tsx에서 바로 넘기지 않는가:
 *   서버 컴포넌트는 클라이언트 컴포넌트에 **일반 함수를 넘길 수 없다**(직렬화 불가).
 *   Server Action은 예외지만 hrefFor·geocode·parseText는 평범한 함수다.
 *   그래서 클라이언트 쪽에서 직접 import 해 화면에 연결한다.
 *
 * page.tsx는 계속 "데이터를 가져와 props로 넘기는 서버 컴포넌트"로 남는다.
 */
export function AddClient() {
  return (
    <PropertyAddScreen
      hrefFor={hrefFor}
      onCreate={createProperty}
      onGeocode={geocode}
      onParseText={parseText}
    />
  );
}
