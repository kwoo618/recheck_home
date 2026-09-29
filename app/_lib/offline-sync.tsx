'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { saveVisitResults } from '@/lib/actions/visit';
import { FLUSH_EVENT, flushQueue, type SendItem } from '@/lib/client/offline';

/**
 * Service Worker 등록 + 오프라인 입력 큐 재전송 (V2-PLAN §4-4)
 *
 * 루트 레이아웃에 한 번만 둔다. 화면(components/)은 큐에 넣기만 하고, 보내는 일은 여기서 한다.
 * 보내는 시점: 처음 열 때 · 온라인 복귀 · 화면으로 돌아옴 · 헤더의 [다시 보내기].
 *
 * ★ 개발 서버에서는 SW를 등록하지 않는다. `_next/static`을 캐시하면 HMR이 옛 청크를 받는다.
 * ★ 한 건씩 보낸다 — 묶으면 Server Action 본문 1MB 상한에 걸릴 수 있다 (V2-TECH-REVIEW §5-2).
 */
const send: SendItem = (item) => saveVisitResults(item.propertyId, [item.payload]);

export function OfflineSync() {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // 등록 실패는 오프라인 열람만 못 할 뿐 온라인 동작에는 영향이 없다 (R4)
    });
  }, []);

  useEffect(() => {
    let alive = true;
    const flush = async () => {
      const sent = await flushQueue(send);
      // 서버 값이 바뀌었으니 지금 보고 있는 화면을 새로 그린다
      if (alive && sent > 0) router.refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void flush();
    };

    void flush();
    window.addEventListener('online', flush);
    window.addEventListener(FLUSH_EVENT, flush);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.removeEventListener('online', flush);
      window.removeEventListener(FLUSH_EVENT, flush);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router]);

  return null;
}
