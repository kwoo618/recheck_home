'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { readQueueSummary, retryStuckItems, subscribeQueue } from '@/lib/client/offline';
import type { QueueSummary } from '@/lib/offline/queue';

/**
 * 헤더의 연결 상태 + 대기 중 큐 항목 수 (CLAUDE.md UI 관습 · V2-TECH-REVIEW §6)
 *
 * "마지막 저장 우선"은 충돌 시 조용히 덮어쓴다는 뜻이다. 유실을 막지는 못해도 **보이지 않는 유실**은 없앤다 —
 * 기기에 남아 있는 건수를 늘 보이고, 서버에 가면 사라진다.
 * 온라인이고 대기 0건이면 아무것도 그리지 않는다.
 */

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function NetworkStatus({ offlineHref }: { offlineHref: string }) {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [summary, setSummary] = useState<QueueSummary>({ pending: 0, stuck: 0 });

  useEffect(() => {
    let alive = true;
    const load = () => {
      void readQueueSummary().then((s) => {
        if (alive) setSummary(s);
      });
    };
    load();
    const off = subscribeQueue(load);
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (online && summary.pending === 0) return null;

  return (
    <div className="rc-net-status" aria-live="polite">
      {!online && <span className="rc-save-chip rc-net-offline">오프라인</span>}
      {summary.pending > 0 && (
        <Link href={offlineHref} className="rc-save-chip rc-net-queue">
          보낼 기록 {summary.pending}건
        </Link>
      )}
      {summary.stuck > 0 && online && (
        <button
          type="button"
          className="rc-save-chip rc-save-error rc-net-retry"
          onClick={() => void retryStuckItems()}
        >
          못 보낸 {summary.stuck}건 다시 보내기
        </button>
      )}
    </div>
  );
}
