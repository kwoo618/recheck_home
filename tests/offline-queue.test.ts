// 가상 데이터
import { describe, it, expect } from 'vitest';
import {
  MAX_AUTO_ATTEMPTS,
  QUEUE_ITEM_MAX_BYTES,
  enqueue,
  isStuck,
  itemBytes,
  makeVisitItem,
  queueKey,
  retryStuck,
  sendOrder,
  settle,
  summarize,
  supersede,
  toSheetSnapshot,
  withQueued,
  type QueueItem,
} from '@/lib/offline/queue';
import type { PropertyDTO } from '@/lib/types';

/**
 * 오프라인 입력 큐 (V2-PLAN §4-4 · V2-TECH-REVIEW §4 · §5-2) — lib/offline/queue.ts
 *
 *   ① 순서: 저장한 순서대로 한 건씩
 *   ② 재시도: 실패는 지우지 않고, 상한을 넘기면 멈춘 채 남는다 (조용한 유실 금지)
 *   ③ 충돌: 마지막 저장 우선 — 보내는 중에 고친 값, 온라인에서 먼저 저장한 값
 *   ④ 1MB: 항목 하나가 상한을 넘으면 받지 않는다
 */

const P = 'prop-1';

function item(checkId: string, savedAt: number, memo = ''): QueueItem {
  return makeVisitItem(P, { id: checkId, result: 'bad', memo }, savedAt);
}

function fill(...items: QueueItem[]): QueueItem[] {
  return items.reduce<QueueItem[]>((q, i) => enqueue(q, i).queue, []);
}

describe('enqueue — 마지막 저장 우선', () => {
  it('같은 항목은 한 건만 남고 늦게 저장한 값이 이긴다', () => {
    const q = fill(item('c1', 100, '처음'), item('c1', 200, '고침'));
    expect(q).toHaveLength(1);
    expect(q[0].payload.memo).toBe('고침');
  });

  it('더 이른 시각의 값은 받지 않는다 (stale)', () => {
    const q = fill(item('c1', 200, '나중'));
    const r = enqueue(q, item('c1', 100, '먼저'));
    expect(r.accepted).toBe(false);
    if (!r.accepted) expect(r.reason).toBe('stale');
    expect(r.queue[0].payload.memo).toBe('나중');
  });

  it('같은 시각이면 새로 들어온 값이 이긴다', () => {
    const q = fill(item('c1', 100, 'a'), item('c1', 100, 'b'));
    expect(q[0].payload.memo).toBe('b');
  });

  it('교체되면 시도 횟수·사유가 초기화된다', () => {
    let q = fill(item('c1', 100));
    for (let i = 0; i < MAX_AUTO_ATTEMPTS; i++) q = settle(q, q[0], { ok: false, error: 'x' });
    expect(isStuck(q[0])).toBe(true);
    q = enqueue(q, item('c1', 300)).queue;
    expect(q[0].attempts).toBe(0);
    expect(q[0].lastError).toBeNull();
  });

  it('항목 하나가 본문 상한을 넘으면 받지 않는다', () => {
    const big = item('c1', 100, '가'.repeat(Math.ceil(QUEUE_ITEM_MAX_BYTES / 3) + 10));
    expect(itemBytes(big)).toBeGreaterThan(QUEUE_ITEM_MAX_BYTES);
    const r = enqueue([], big);
    expect(r.accepted).toBe(false);
    if (!r.accepted) expect(r.reason).toBe('too_large');
    expect(r.queue).toEqual([]);
  });

  it('상한은 Server Action 기본 1MB보다 작다', () => {
    expect(QUEUE_ITEM_MAX_BYTES).toBeLessThan(1024 * 1024);
  });

  it('입력 배열을 바꾸지 않는다', () => {
    const q = fill(item('c1', 100));
    const snapshot = JSON.stringify(q);
    enqueue(q, item('c2', 200));
    expect(JSON.stringify(q)).toBe(snapshot);
  });
});

describe('sendOrder — 순서', () => {
  it('저장한 순서대로 보낸다 (넣은 순서와 무관)', () => {
    const q = fill(item('c3', 300), item('c1', 100), item('c2', 200));
    expect(sendOrder(q).map((i) => i.payload.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('같은 시각이면 키 순으로 고정된다', () => {
    const q = fill(item('b', 100), item('a', 100));
    expect(sendOrder(q).map((i) => i.payload.id)).toEqual(['a', 'b']);
  });

  it('멈춘 항목은 자동으로 보내지 않는다', () => {
    let q = fill(item('c1', 100), item('c2', 200));
    for (let i = 0; i < MAX_AUTO_ATTEMPTS; i++) q = settle(q, q[0], { ok: false, error: 'x' });
    expect(sendOrder(q).map((i) => i.payload.id)).toEqual(['c2']);
  });
});

describe('settle — 결과 반영', () => {
  it('성공하면 그 항목만 빠진다', () => {
    const q = fill(item('c1', 100), item('c2', 200));
    const next = settle(q, q[0], { ok: true });
    expect(next.map((i) => i.payload.id)).toEqual(['c2']);
  });

  it('실패는 지우지 않고 시도 횟수와 사유를 남긴다', () => {
    const q = fill(item('c1', 100));
    const next = settle(q, q[0], { ok: false, error: '매물을 찾을 수 없습니다.' });
    expect(next).toHaveLength(1);
    expect(next[0].attempts).toBe(1);
    expect(next[0].lastError).toBe('매물을 찾을 수 없습니다.');
  });

  it(`실패가 ${MAX_AUTO_ATTEMPTS}번이면 멈추지만 큐에는 남는다`, () => {
    let q = fill(item('c1', 100));
    for (let i = 0; i < MAX_AUTO_ATTEMPTS; i++) q = settle(q, q[0], { ok: false, error: 'x' });
    expect(q).toHaveLength(1);
    expect(isStuck(q[0])).toBe(true);
    expect(summarize(q)).toEqual({ pending: 1, stuck: 1 });
  });

  it('보내는 중에 같은 항목을 고쳤으면 성공해도 새 값은 남는다 (충돌)', () => {
    const q = fill(item('c1', 100, '옛 값'));
    const sending = q[0];
    const edited = enqueue(q, item('c1', 150, '새 값')).queue;
    const next = settle(edited, sending, { ok: true });
    expect(next).toHaveLength(1);
    expect(next[0].payload.memo).toBe('새 값');
    expect(next[0].attempts).toBe(0);
  });

  it('보내는 중에 고쳤으면 실패해도 새 값의 시도 횟수를 올리지 않는다', () => {
    const q = fill(item('c1', 100));
    const sending = q[0];
    const edited = enqueue(q, item('c1', 150)).queue;
    const next = settle(edited, sending, { ok: false, error: 'x' });
    expect(next[0].attempts).toBe(0);
  });

  it('이미 빠진 항목의 결과는 무시한다', () => {
    const q = fill(item('c1', 100));
    expect(settle([], q[0], { ok: true })).toEqual([]);
  });
});

describe('retryStuck — 다시 보내기', () => {
  it('멈춘 항목만 시도 횟수를 되돌린다', () => {
    let q = fill(item('c1', 100), item('c2', 200));
    for (let i = 0; i < MAX_AUTO_ATTEMPTS; i++) q = settle(q, q[0], { ok: false, error: 'x' });
    q = settle(q, q[1], { ok: false, error: 'y' });
    const next = retryStuck(q);
    expect(next[0].attempts).toBe(0);
    expect(next[1].attempts).toBe(1);
    expect(sendOrder(next).map((i) => i.payload.id)).toEqual(['c1', 'c2']);
  });
});

describe('supersede — 온라인 저장이 먼저 끝났을 때', () => {
  it('그 시각 이전에 쌓인 같은 항목을 치운다', () => {
    const q = fill(item('c1', 100), item('c2', 100));
    const next = supersede(q, P, ['c1'], 200);
    expect(next.map((i) => i.payload.id)).toEqual(['c2']);
  });

  it('그 시각 이후에 쌓인 항목은 남긴다', () => {
    const q = fill(item('c1', 300));
    expect(supersede(q, P, ['c1'], 200)).toHaveLength(1);
  });

  it('다른 매물의 같은 항목 id는 건드리지 않는다', () => {
    const other = makeVisitItem('prop-2', { id: 'c1', result: 'ok', memo: '' }, 100);
    const q = fill(item('c1', 100), other);
    const next = supersede(q, P, ['c1'], 200);
    expect(next.map((i) => i.key)).toEqual([queueKey('prop-2', 'c1')]);
  });
});

describe('조사지 스냅샷', () => {
  const property = {
    id: P,
    name: '가상 원룸 A',
    address: '가상시 가상구 가상로 1',
    addressDetail: '101동 1001호',
    visitChecks: [
      { id: 'c2', propertyId: P, ruleId: 'r2', category: '구조', title: '둘째', description: '', result: '', memo: '', sort: 1 },
      { id: 'c1', propertyId: P, ruleId: 'r1', category: '구조', title: '첫째', description: '설명', result: 'good', memo: '', sort: 0 },
    ],
    questions: [{ id: 'q1', propertyId: P, text: '가상 질문', source: 'bank', answer: '가상 답', noAnswer: false, sort: 0 }],
    deposit: 1000,
  } as unknown as PropertyDTO;

  it('상세주소를 담지 않는다 (R7)', () => {
    const s = toSheetSnapshot(property, 1);
    expect(JSON.stringify(s)).not.toContain('1001호');
    expect(Object.keys(s)).not.toContain('addressDetail');
  });

  it('조사지 열람에 필요 없는 금액을 담지 않는다', () => {
    expect(Object.keys(toSheetSnapshot(property, 1))).not.toContain('deposit');
  });

  it('항목을 sort 순으로 담는다', () => {
    expect(toSheetSnapshot(property, 1).visitChecks.map((v) => v.id)).toEqual(['c1', 'c2']);
  });

  it('보내지 않은 입력을 얹어 보여 준다 (다른 매물 것은 제외)', () => {
    const s = toSheetSnapshot(property, 1);
    const q = fill(
      makeVisitItem(P, { id: 'c2', result: 'bad', memo: '곰팡이' }, 5),
      makeVisitItem('prop-2', { id: 'c1', result: 'na', memo: '' }, 5),
    );
    const merged = withQueued(s, q);
    expect(merged.visitChecks.find((v) => v.id === 'c2')).toMatchObject({ result: 'bad', memo: '곰팡이' });
    expect(merged.visitChecks.find((v) => v.id === 'c1')).toMatchObject({ result: 'good' });
  });
});
