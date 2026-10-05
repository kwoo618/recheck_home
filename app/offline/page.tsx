import type { Metadata } from 'next';
import { Suspense } from 'react';
import { preload } from 'react-dom';
import logo from '@/components/screens/_parts/logo-cream@2x.png';
import { OfflineClient } from './offline-client';

export const metadata: Metadata = { title: '이 기기에 저장한 조사지 — Sealook Homes' };

/**
 * 오프라인 조사지 (V2-PLAN §4-4) — **정적 페이지**여야 한다.
 *
 * 서버 데이터를 읽지 않는다. Service Worker(public/sw.js)가 이 HTML 한 장과 청크를 캐시하고,
 * 연결이 없을 때 /property/[id]/sheet·record 이동을 /offline?id=… 로 돌린다.
 * 화면은 IndexedDB 사본으로 그린다. 여기서 getProperty 등을 부르면 동적 페이지가 되어 캐시가 깨진다.
 */
export default function OfflinePage() {
  // 화면은 useSearchParams 때문에 클라이언트에서만 그려져 셸 HTML 에 머리글 로고가 없다.
  // SW(public/sw.js)는 셸 HTML 에 나온 /_next/static 경로만 캐시하므로, 로고 경로를 HTML 에 남긴다.
  preload(logo.src, { as: 'image' });
  return (
    <Suspense>
      <OfflineClient />
    </Suspense>
  );
}
