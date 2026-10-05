import type { VisitResult } from '@/db/schema';
import type { PropertyDTO } from '@/lib/types';

/**
 * 오프라인 입력 큐 — 순수 함수 (V2-PLAN §4-4 · V2-TECH-REVIEW §4 · §5-2)
 *
 * 현장(비행기 모드·지하·엘리베이터)에서 넣은 방문 결과·메모를 기기에 쌓았다가,
 * 연결되면 Server Action으로 **한 건씩 순차** 보낸다. 저장소(IndexedDB)·전송은 lib/client/offline.ts가 하고,
 * 여기는 "무엇을, 어떤 순서로, 결과를 받으면 큐가 어떻게 바뀌는가"만 정한다.
 *
 * ★ 마지막 저장 우선. 같은 항목을 여러 번 고치면 마지막 값 하나만 남는다.
 * ★ 조용한 유실 금지. 실패한 항목은 지우지 않는다 — 시도 횟수와 사유를 달고 남는다.
 *   자동 재시도 상한을 넘기면 "보내지 못함"으로 헤더에 보이고, 사용자가 다시 보내거나 지운다.
 * ★ 시각(savedAt)은 호출부가 넘긴다. 여기서 Date.now()를 부르지 않는다.
 */

/**
 * 항목 1건의 본문 상한.
 * Server Action 요청 본문 기본 상한 1MB(V2-TECH-REVIEW §5-2 — Next.js 문서)보다 작게 잡는다.
 * 액션 인코딩이 JSON 위에 덧붙는 몫이 있어 1MB 딱 맞춰 재면 경계에서 413이 난다. 여유분은 실측값이 아니다.
 */
export const QUEUE_ITEM_MAX_BYTES = 900 * 1024;

/** 자동 재시도 상한. 넘으면 사용자가 [다시 보내기]를 누를 때까지 멈춘다 */
export const MAX_AUTO_ATTEMPTS = 3;

/** saveVisitResults(propertyId, [payload])에 그대로 들어가는 한 건 */
export type VisitResultPayload = {
  id: string;
  result: VisitResult;
  memo: string;
};

export type QueueItem = {
  /** `visit:${propertyId}:${checkId}` — 같은 키는 한 건만 남는다 */
  key: string;
  kind: 'visit-result';
  propertyId: string;
  payload: VisitResultPayload;
  /** 기기에 저장한 시각(ms). 순서와 충돌 판단의 기준 */
  savedAt: number;
  attempts: number;
  lastError: string | null;
};

export type EnqueueResult =
  | { accepted: true; queue: QueueItem[] }
  | { accepted: false; queue: QueueItem[]; reason: 'too_large' | 'stale' };

export type SendOutcome = { ok: true } | { ok: false; error: string };

export function queueKey(propertyId: string, checkId: string): string {
  return `visit:${propertyId}:${checkId}`;
}

export function makeVisitItem(
  propertyId: string,
  payload: VisitResultPayload,
  savedAt: number,
): QueueItem {
  return {
    key: queueKey(propertyId, payload.id),
    kind: 'visit-result',
    propertyId,
    payload: { id: payload.id, result: payload.result, memo: payload.memo },
    savedAt,
    attempts: 0,
    lastError: null,
  };
}

/** 전송 본문 바이트 수 (UTF-8). 액션 인자 [propertyId, [payload]]를 JSON으로 잰다 */
export function itemBytes(item: QueueItem): number {
  return new TextEncoder().encode(JSON.stringify([item.propertyId, [item.payload]])).length;
}

/**
 * 큐에 넣는다. 같은 키가 있으면 **더 늦게 저장한 쪽**이 남는다.
 * 같은 시각이면 새로 들어온 쪽이 이긴다 — 사용자가 방금 누른 것이 마지막 저장이다.
 * 교체된 항목은 시도 횟수·사유를 초기화한다(새 값은 아직 보낸 적이 없다).
 */
export function enqueue(queue: QueueItem[], item: QueueItem): EnqueueResult {
  if (itemBytes(item) > QUEUE_ITEM_MAX_BYTES) {
    return { accepted: false, queue, reason: 'too_large' };
  }
  const current = queue.find((q) => q.key === item.key);
  if (current && current.savedAt > item.savedAt) {
    return { accepted: false, queue, reason: 'stale' };
  }
  const fresh: QueueItem = { ...item, attempts: 0, lastError: null };
  return {
    accepted: true,
    queue: current ? queue.map((q) => (q.key === item.key ? fresh : q)) : [...queue, fresh],
  };
}

/** 자동 재시도 상한에 닿은 항목 */
export function isStuck(item: QueueItem): boolean {
  return item.attempts >= MAX_AUTO_ATTEMPTS;
}

/**
 * 이번에 보낼 항목과 순서 — 저장한 순서대로(오래된 것 먼저), 같은 시각이면 키 순.
 * 상한에 닿은 항목은 빠진다(사용자가 다시 보내기 전까지).
 */
export function sendOrder(queue: QueueItem[]): QueueItem[] {
  return queue
    .filter((q) => !isStuck(q))
    .sort((a, b) => a.savedAt - b.savedAt || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * 한 건을 보낸 뒤 큐를 갱신한다.
 *
 * ★ 충돌: 보내는 동안 사용자가 같은 항목을 다시 고쳤으면(savedAt이 달라졌으면) 큐의 새 값을
 *   건드리지 않는다. 성공이어도 지우지 않는다 — 방금 보낸 것은 이미 옛 값이다.
 * ★ 실패는 지우지 않는다. 시도 횟수를 올리고 사유를 남긴다.
 */
export function settle(queue: QueueItem[], sent: QueueItem, outcome: SendOutcome): QueueItem[] {
  const current = queue.find((q) => q.key === sent.key);
  if (!current || current.savedAt !== sent.savedAt) return queue;
  if (outcome.ok) return queue.filter((q) => q.key !== sent.key);
  return queue.map((q) =>
    q.key === sent.key ? { ...q, attempts: q.attempts + 1, lastError: outcome.error } : q,
  );
}

/** [다시 보내기] — 멈춘 항목의 시도 횟수를 되돌린다. 사유는 다음 결과가 덮어쓸 때까지 남긴다 */
export function retryStuck(queue: QueueItem[]): QueueItem[] {
  return queue.map((q) => (isStuck(q) ? { ...q, attempts: 0 } : q));
}

/**
 * 온라인 화면에서 저장이 성공했을 때, 그보다 **먼저** 기기에 쌓인 같은 항목을 치운다.
 * 치우지 않으면 나중에 옛 오프라인 값이 방금 저장한 값을 덮어쓴다(마지막 저장 우선 위반).
 */
export function supersede(
  queue: QueueItem[],
  propertyId: string,
  checkIds: string[],
  savedAt: number,
): QueueItem[] {
  const keys = new Set(checkIds.map((id) => queueKey(propertyId, id)));
  return queue.filter((q) => !(keys.has(q.key) && q.savedAt <= savedAt));
}

export type QueueSummary = { pending: number; stuck: number };

/** 헤더 표시용 — pending은 아직 서버에 가지 않은 전부(멈춘 것 포함) */
export function summarize(queue: QueueItem[]): QueueSummary {
  return { pending: queue.length, stuck: queue.filter(isStuck).length };
}

/* ══════════════════════════════════════════════════════════════
   조사지 스냅샷 — 오프라인에서 열 조사지의 사본
   ══════════════════════════════════════════════════════════════ */

/**
 * 오프라인 조사지가 쓰는 필드만 남긴 사본.
 * ★ R7: 상세주소(address_detail)를 담지 않는다. 금액·금융 정보도 조사지 열람에 필요 없어 담지 않는다.
 */
export type SheetSnapshot = {
  id: string;
  name: string;
  address: string;
  visitChecks: {
    id: string;
    category: string;
    title: string;
    description: string;
    result: VisitResult;
    memo: string;
  }[];
  questions: { id: string; text: string }[];
  /** 기기에 사본을 만든 시각(ms) */
  savedAt: number;
};

export function toSheetSnapshot(property: PropertyDTO, savedAt: number): SheetSnapshot {
  return {
    id: property.id,
    name: property.name,
    address: property.address,
    visitChecks: [...property.visitChecks]
      .sort((a, b) => a.sort - b.sort)
      .map(({ id, category, title, description, result, memo }) => ({
        id,
        category,
        title,
        description,
        result,
        memo,
      })),
    questions: [...property.questions]
      .sort((a, b) => a.sort - b.sort)
      .map(({ id, text }) => ({ id, text })),
    savedAt,
  };
}

/** 사본 위에 아직 보내지 않은 입력을 얹는다 — 오프라인 화면을 다시 열어도 마지막 입력이 보인다 */
export function withQueued(snapshot: SheetSnapshot, queue: QueueItem[]): SheetSnapshot {
  const byCheck = new Map(
    queue.filter((q) => q.propertyId === snapshot.id).map((q) => [q.payload.id, q.payload]),
  );
  return {
    ...snapshot,
    visitChecks: snapshot.visitChecks.map((v) => {
      const p = byCheck.get(v.id);
      return p ? { ...v, result: p.result, memo: p.memo } : v;
    }),
  };
}
