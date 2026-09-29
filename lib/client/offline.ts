'use client';

import type { ActionResult } from '@/lib/types';
import {
  enqueue,
  makeVisitItem,
  retryStuck,
  sendOrder,
  settle,
  summarize,
  supersede,
  type EnqueueResult,
  type QueueItem,
  type QueueSummary,
  type SheetSnapshot,
  type VisitResultPayload,
} from '@/lib/offline/queue';

/**
 * 오프라인 조사지 사본 + 입력 큐 — IndexedDB (V2-PLAN §4-4 · V2-TECH-REVIEW §4)
 *
 * 규칙(순서·재시도·충돌)은 lib/offline/queue.ts의 순수 함수가 정하고, 여기는 저장과 전송만 한다.
 * 큐 전체를 레코드 하나로 두고 readwrite 트랜잭션 하나 안에서 읽고-바꾸고-쓴다.
 * 탭이 둘이어도 한 트랜잭션 안의 갱신은 섞이지 않는다.
 *
 * ★ 원본 문서는 여기 두지 않는다 — 원본은 vault.ts(별도 DB)의 몫이다.
 * ★ 모든 함수는 예외를 던지지 않는다. IndexedDB를 못 쓰면 빈 값·false로 수렴한다 (R4).
 *   이 경우 큐에 넣지 못했다는 사실을 호출부가 화면에 알린다 — 조용히 삼키지 않는다.
 */

const DB_NAME = 'sealook-offline';
const DB_VERSION = 1;
const SHEETS = 'sheets';
const META = 'meta';
const QUEUE_KEY = 'queue';

/** 같은 탭·다른 탭에 큐가 바뀌었다고 알리는 이름 */
export const QUEUE_EVENT = 'sealook:queue';
/** 큐를 지금 보내 달라는 요청 (헤더의 [다시 보내기] → app/_lib/offline-sync) */
export const FLUSH_EVENT = 'sealook:flush';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SHEETS)) db.createObjectStore(SHEETS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** 트랜잭션 하나. body가 돌려준 값이 완료 시 결과가 된다. 실패하면 fallback */
async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fallback: T,
  body: (s: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  const db = await openDb();
  if (!db) return fallback;
  return new Promise<T>((resolve) => {
    try {
      const t = db.transaction(store, mode);
      let value = fallback;
      body(t.objectStore(store), (v) => (value = v));
      t.oncomplete = () => {
        db.close();
        resolve(value);
      };
      t.onerror = t.onabort = () => {
        db.close();
        resolve(fallback);
      };
    } catch {
      db.close();
      resolve(fallback);
    }
  });
}

/* ── 알림 ───────────────────────────────────────────────────── */

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  channel = new BroadcastChannel(QUEUE_EVENT);
  return channel;
}

function notify() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(QUEUE_EVENT));
  getChannel()?.postMessage('changed');
}

/** 큐가 바뀌면 부른다(이 탭·다른 탭). 해제 함수를 돌려준다 */
export function subscribeQueue(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(QUEUE_EVENT, cb);
  const ch = getChannel();
  ch?.addEventListener('message', cb);
  return () => {
    window.removeEventListener(QUEUE_EVENT, cb);
    ch?.removeEventListener('message', cb);
  };
}

export function requestFlush() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(FLUSH_EVENT));
}

/* ── 큐 ─────────────────────────────────────────────────────── */

export async function readQueue(): Promise<QueueItem[]> {
  return tx<QueueItem[]>(META, 'readonly', [], (s, done) => {
    const req = s.get(QUEUE_KEY);
    req.onsuccess = () => done(Array.isArray(req.result) ? (req.result as QueueItem[]) : []);
  });
}

/**
 * 큐를 읽고 순수 함수로 바꾼 뒤 같은 트랜잭션에서 쓴다.
 * 저장하지 못하면 null — 호출부는 "기기에 저장하지 못했다"를 보여 줘야 한다.
 */
async function updateQueue<R>(
  change: (q: QueueItem[]) => { queue: QueueItem[]; result: R },
): Promise<R | null> {
  const out = await tx<R | null>(META, 'readwrite', null, (s, done) => {
    const req = s.get(QUEUE_KEY);
    req.onsuccess = () => {
      const current = Array.isArray(req.result) ? (req.result as QueueItem[]) : [];
      const { queue, result } = change(current);
      s.put(queue, QUEUE_KEY).onsuccess = () => done(result);
    };
  });
  if (out !== null) notify();
  return out;
}

export async function readQueueSummary(): Promise<QueueSummary> {
  return summarize(await readQueue());
}

/**
 * 방문 결과 여러 건을 큐에 넣는다. 한 건씩 enqueue 규칙을 거친다.
 * 돌려주는 값: 받은 건수와 받지 못한 건수(너무 큼·더 새 값 있음). 저장 자체가 안 되면 null.
 */
export async function queueVisitResults(
  propertyId: string,
  payloads: VisitResultPayload[],
  savedAt: number,
): Promise<{ accepted: number; tooLarge: number; stale: number } | null> {
  return updateQueue((q) => {
    let queue = q;
    const tally = { accepted: 0, tooLarge: 0, stale: 0 };
    for (const p of payloads) {
      const r: EnqueueResult = enqueue(queue, makeVisitItem(propertyId, p, savedAt));
      queue = r.queue;
      if (r.accepted) tally.accepted++;
      else if (r.reason === 'too_large') tally.tooLarge++;
      else tally.stale++;
    }
    return { queue, result: tally };
  });
}

/** 온라인 화면에서 저장이 끝났을 때 — 그보다 먼저 쌓인 같은 항목을 치운다 */
export async function supersedeQueued(
  propertyId: string,
  checkIds: string[],
  savedAt: number,
): Promise<void> {
  await updateQueue((q) => ({ queue: supersede(q, propertyId, checkIds, savedAt), result: true }));
}

export async function retryStuckItems(): Promise<void> {
  await updateQueue((q) => ({ queue: retryStuck(q), result: true }));
  requestFlush();
}

/** 사용자가 [이 기기에서 지우기]를 눌렀을 때만 부른다 */
export async function discardQueued(key: string): Promise<void> {
  await updateQueue((q) => ({ queue: q.filter((i) => i.key !== key), result: true }));
}

/* ── 전송 ───────────────────────────────────────────────────── */

export type SendItem = (item: QueueItem) => Promise<ActionResult<unknown>>;

let flushing = false;

/**
 * 큐를 한 건씩 순차 전송한다 (V2-TECH-REVIEW §5-2 — 묶어서 보내지 않는다).
 *
 * · 한 번 호출에 항목마다 최대 한 번만 보낸다. 실패한 항목을 같은 호출 안에서 다시 돌리지 않는다.
 * · 보내는 도중 연결이 끊기면(예외 + navigator.onLine=false) 그 항목은 결과를 기록하지 않고 멈춘다.
 *   시도 횟수는 서버가 받아 본 경우에만 오른다.
 * 돌려주는 값: 이번에 성공한 건수.
 */
export async function flushQueue(send: SendItem): Promise<number> {
  if (flushing || typeof navigator === 'undefined' || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of sendOrder(await readQueue())) {
      if (!navigator.onLine) break;
      let outcome: { ok: true } | { ok: false; error: string };
      try {
        const r = await send(item);
        outcome = r.ok ? { ok: true } : { ok: false, error: r.error };
      } catch {
        if (!navigator.onLine) break;
        outcome = { ok: false, error: '서버에 보내지 못했어요.' };
      }
      await updateQueue((q) => ({ queue: settle(q, item, outcome), result: true }));
      if (outcome.ok) {
        sent++;
        await patchSheet(item);
      }
    }
  } finally {
    flushing = false;
  }
  return sent;
}

/* ── 조사지 사본 ─────────────────────────────────────────────── */

export async function saveSheet(snapshot: SheetSnapshot): Promise<boolean> {
  return tx<boolean>(SHEETS, 'readwrite', false, (s, done) => {
    s.put(snapshot).onsuccess = () => done(true);
  });
}

export async function readSheet(id: string): Promise<SheetSnapshot | null> {
  return tx<SheetSnapshot | null>(SHEETS, 'readonly', null, (s, done) => {
    const req = s.get(id);
    req.onsuccess = () => done((req.result as SheetSnapshot | undefined) ?? null);
  });
}

export async function listSheets(): Promise<SheetSnapshot[]> {
  const all = await tx<SheetSnapshot[]>(SHEETS, 'readonly', [], (s, done) => {
    const req = s.getAll();
    req.onsuccess = () => done(req.result as SheetSnapshot[]);
  });
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

/** 보낸 값을 사본에도 반영한다. 온라인 화면을 다시 열기 전에 오프라인 화면이 옛 값을 보이지 않게 */
async function patchSheet(item: QueueItem): Promise<void> {
  await tx<boolean>(SHEETS, 'readwrite', false, (s, done) => {
    const req = s.get(item.propertyId);
    req.onsuccess = () => {
      const sheet = req.result as SheetSnapshot | undefined;
      if (!sheet) return;
      const next: SheetSnapshot = {
        ...sheet,
        visitChecks: sheet.visitChecks.map((v) =>
          v.id === item.payload.id ? { ...v, result: item.payload.result, memo: item.payload.memo } : v,
        ),
      };
      s.put(next).onsuccess = () => done(true);
    };
  });
}
