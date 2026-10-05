'use client';

import { useEffect } from 'react';
import { saveSheet } from '@/lib/client/offline';
import { toSheetSnapshot } from '@/lib/offline/queue';
import type { PropertyDTO } from '@/lib/types';

/**
 * 온라인에서 조사지·방문 기록 화면을 열 때마다 조사지 사본을 이 기기(IndexedDB)에 갈아 둔다.
 * 연결이 끊기면 /offline 이 이 사본으로 조사지를 그린다 (V2-TECH-REVIEW §4-1 ②).
 *
 * 사본에는 조사지에 필요한 필드만 담는다 — 상세주소·금액은 없다 (toSheetSnapshot, R7).
 * 저장 실패(저장소를 못 쓰는 환경)는 오프라인 열람만 못 할 뿐이라 화면에 띄우지 않는다.
 */
export function useSheetMirror(property: PropertyDTO) {
  useEffect(() => {
    void saveSheet(toSheetSnapshot(property, Date.now()));
  }, [property]);
}
