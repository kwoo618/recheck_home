'use client';

import { useSearchParams } from 'next/navigation';
import { OfflineSheetScreen } from '@/components/screens/offline-sheet-screen';
import { hrefFor } from '@/app/_lib/nav';

/** 오프라인 조사지의 클라이언트 경계 — 쿼리 ?id= 를 화면에 넘긴다 */
export function OfflineClient() {
  const id = useSearchParams().get('id');
  return <OfflineSheetScreen propertyId={id || null} hrefFor={hrefFor} />;
}
