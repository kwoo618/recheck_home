'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { VisitResult } from '@/db/schema';
import {
  discardQueued,
  listSheets,
  queueVisitResults,
  readQueue,
  readSheet,
  requestFlush,
  subscribeQueue,
} from '@/lib/client/offline';
import { isStuck, withQueued, type QueueItem, type SheetSnapshot } from '@/lib/offline/queue';
import { ScreenShell } from './_parts/screen-shell';
import { SourceBadge } from './_parts/source-badge';
import { RESULT_CHOICES, resultLabel } from './_parts/format';
import type { HrefFor } from './_parts/nav';

/**
 * 이 기기에 저장한 조사지 (V2-PLAN §4-4 · V2-TECH-REVIEW §4) — 오프라인 전용 화면
 *
 * 매물 화면은 서버가 그리므로 연결이 없으면 열리지 않는다. 이 화면은 정적 셸이고,
 * 조사지·방문 기록 화면을 온라인에서 열 때 만든 사본(IndexedDB)으로 그린다.
 *
 * 범위: 조사지 열람 + 직접 확인한 항목의 결과·메모 입력까지. 질문 답변 입력은 "나중"이다(V2-STATUS 열린 결정).
 * ★ 입력은 서버로 바로 가지 않고 큐에 쌓인다. 연결되면 app/_lib/offline-sync가 한 건씩 보낸다.
 * ★ R5: 이 화면은 방문 기록(국면 B)의 일부다 — 결과 입력은 방문 뒤에 하는 것이다.
 * ★ R7: 사본에는 상세주소가 없다(lib/offline/queue toSheetSnapshot). 인쇄 경로도 두지 않는다.
 */

export type OfflineSheetScreenProps = {
  /** 쿼리 ?id= — 없으면 저장한 조사지 목록 */
  propertyId: string | null;
  hrefFor: HrefFor;
};

function formatSavedAt(ms: number): string {
  return new Date(ms).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function OfflineSheetScreen({ propertyId, hrefFor }: OfflineSheetScreenProps) {
  const [loaded, setLoaded] = useState(false);
  const [sheet, setSheet] = useState<SheetSnapshot | null>(null);
  const [sheets, setSheets] = useState<SheetSnapshot[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    // IndexedDB는 브라우저에만 있다 — 첫 렌더 뒤에 읽고, 큐가 바뀌면(전송·다른 탭) 다시 읽는다
    let alive = true;
    const load = () => {
      void Promise.all([
        propertyId ? readSheet(propertyId) : Promise.resolve(null),
        listSheets(),
        readQueue(),
      ]).then(([one, all, q]) => {
        if (!alive) return;
        setSheet(one);
        setSheets(all);
        setQueue(q);
        setLoaded(true);
      });
    };
    load();
    const off = subscribeQueue(load);
    return () => {
      alive = false;
      off();
    };
  }, [propertyId]);

  const merged = useMemo(() => (sheet ? withQueued(sheet, queue) : null), [sheet, queue]);

  return (
    <ScreenShell hrefFor={hrefFor}>
      <div className="rc-screen-only">
        {!loaded ? (
          <p className="rc-field-note">이 기기에 저장한 조사지를 여는 중…</p>
        ) : merged ? (
          <SheetEditor key={merged.id} sheet={merged} hrefFor={hrefFor} />
        ) : (
          <>
            {propertyId && (
              <p className="rc-notice">
                이 매물의 조사지는 이 기기에 저장되어 있지 않아요. 연결된 상태에서 조사지나 방문 기록 화면을 한 번
                열면 이 기기에 사본이 저장돼요.
              </p>
            )}
            <SheetList sheets={sheets} hrefFor={hrefFor} />
          </>
        )}

        <PendingList queue={queue} sheets={sheets} />
      </div>
    </ScreenShell>
  );
}

/* ── 저장한 조사지 목록 ─────────────────────────────────────── */

function SheetList({ sheets, hrefFor }: { sheets: SheetSnapshot[]; hrefFor: HrefFor }) {
  return (
    <section className="rc-card">
      <h2 className="rc-card-title">이 기기에 저장한 조사지</h2>
      {sheets.length === 0 ? (
        <p className="rc-field-note">
          아직 없어요. 연결된 상태에서 조사지나 방문 기록 화면을 한 번 열면 이 기기에 사본이 저장되고, 연결이 없을
          때도 여기서 열 수 있어요.
        </p>
      ) : (
        sheets.map((s) => (
          <div key={s.id} className="rc-q-item">
            <Link href={hrefFor('offline', s.id)} className="rc-btn rc-btn-ghost">
              {s.name}
            </Link>
            <p className="rc-field-note">저장 시각 {formatSavedAt(s.savedAt)}</p>
          </div>
        ))
      )}
    </section>
  );
}

/* ── 조사지 + 결과·메모 입력 ────────────────────────────────── */

function SheetEditor({ sheet, hrefFor }: { sheet: SheetSnapshot; hrefFor: HrefFor }) {
  const [results, setResults] = useState<Record<string, VisitResult>>(() =>
    Object.fromEntries(sheet.visitChecks.map((v) => [v.id, v.result])),
  );
  const [memos, setMemos] = useState<Record<string, string>>(() =>
    Object.fromEntries(sheet.visitChecks.map((v) => [v.id, v.memo])),
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const changed = sheet.visitChecks.filter(
    (v) => (results[v.id] ?? '') !== v.result || (memos[v.id] ?? '') !== v.memo,
  );

  function setResult(id: string, next: Exclude<VisitResult, ''>) {
    setResults((prev) => ({ ...prev, [id]: prev[id] === next ? '' : next }));
  }

  async function handleSave() {
    setMessage('');
    setError('');
    const payloads = changed.map((v) => ({ id: v.id, result: results[v.id] ?? '', memo: memos[v.id] ?? '' }));
    const tally = await queueVisitResults(sheet.id, payloads, Date.now());
    if (!tally) {
      // 조용히 넘어가면 사용자는 저장된 줄 안다. 입력은 화면에 그대로 둔다
      setError('이 기기에 저장하지 못했어요(브라우저 저장소를 쓸 수 없음). 입력은 화면에 그대로 있어요.');
      return;
    }
    const notes = [`${tally.accepted}건을 이 기기에 저장했어요. 연결되면 순서대로 보냅니다.`];
    if (tally.tooLarge > 0) notes.push(`${tally.tooLarge}건은 메모가 너무 길어 저장하지 못했어요.`);
    if (tally.stale > 0) notes.push(`${tally.stale}건은 더 나중에 저장한 값이 있어 그 값을 남겼어요.`);
    setMessage(notes.join(' '));
    requestFlush();
  }

  return (
    <>
      <section className="rc-card">
        <h2 className="rc-card-title">{sheet.name}</h2>
        {sheet.address && <p className="rc-card-sub">{sheet.address}</p>}
        <p className="rc-notice">
          이 기기에 저장해 둔 사본이에요 (저장 시각 {formatSavedAt(sheet.savedAt)}). 그 뒤에 다른 기기에서 바꾼
          내용은 보이지 않아요. 여기서 입력한 결과는 연결되면 서버로 보내고, 같은 항목은 마지막에 저장한 값이
          남아요.
        </p>
        <div className="rc-form-actions">
          <Link href={hrefFor('record', sheet.id)} className="rc-btn rc-btn-sm rc-btn-ghost">
            연결되어 있으면 — 방문 기록 화면
          </Link>
        </div>
      </section>

      <section className="rc-card">
        <h3 className="rc-group-label">
          직접 확인한 것 <SourceBadge kind="user" />
        </h3>
        {sheet.visitChecks.length === 0 ? (
          <p className="rc-field-note">확인 항목이 없어요. 항목은 연결된 상태에서 조사지 화면에서 추가해요.</p>
        ) : (
          sheet.visitChecks.map((v) => {
            const current = results[v.id] ?? '';
            const showMemo = current === 'bad' || (memos[v.id] ?? '') !== '';
            return (
              <div key={v.id} className="rc-q-item">
                <div className="rc-q-text">
                  <span>{v.title}</span>
                  <span className="rc-q-cat">[{v.category}]</span>
                </div>
                {v.description && <p className="rc-field-note">{v.description}</p>}
                <div className="rc-res-seg" role="group" aria-label={`${v.title} 결과`}>
                  {RESULT_CHOICES.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      aria-pressed={current === choice}
                      className={current === choice ? `rc-on-${choice}` : ''}
                      onClick={() => setResult(v.id, choice)}
                    >
                      {resultLabel(choice)}
                    </button>
                  ))}
                </div>
                {showMemo && (
                  <textarea
                    className="rc-input rc-answer-input"
                    style={{ marginTop: 7 }}
                    rows={2}
                    placeholder="메모 (선택)"
                    aria-label={`${v.title} 메모`}
                    value={memos[v.id] ?? ''}
                    onChange={(e) => setMemos((prev) => ({ ...prev, [v.id]: e.target.value }))}
                  />
                )}
              </div>
            );
          })
        )}

        {error && <p className="rc-error">{error}</p>}
        {message && <p className="rc-notice">{message}</p>}

        <div className="rc-form-actions">
          <button
            type="button"
            className="rc-btn rc-btn-primary"
            disabled={changed.length === 0}
            onClick={() => void handleSave()}
          >
            이 기기에 저장
          </button>
          {changed.length > 0 && <span className="rc-unsaved">저장하지 않은 변경 {changed.length}건</span>}
        </div>
      </section>

      <section className="rc-card">
        <h3 className="rc-group-label">물어볼 것</h3>
        {sheet.questions.length === 0 ? (
          <p className="rc-field-note">질문이 없어요.</p>
        ) : (
          sheet.questions.map((q, i) => (
            <div key={q.id} className="rc-q-item">
              <div className="rc-q-text">
                <span className="rc-q-num">Q{i + 1}</span>
                <span>{q.text}</span>
              </div>
            </div>
          ))
        )}
        <p className="rc-notice">받은 답변은 연결된 뒤 방문 기록 화면에서 적어요. 이 화면에서는 저장하지 않아요.</p>
      </section>
    </>
  );
}

/* ── 아직 보내지 않은 기록 ───────────────────────────────────── */

function PendingList({ queue, sheets }: { queue: QueueItem[]; sheets: SheetSnapshot[] }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  if (queue.length === 0) return null;

  const byId = new Map(sheets.map((s) => [s.id, s]));

  return (
    <section className="rc-card">
      <h3 className="rc-group-label">아직 보내지 않은 기록 {queue.length}건</h3>
      <p className="rc-field-note">
        연결되면 저장한 순서대로 한 건씩 보내고, 보내면 목록에서 사라져요. 세 번 보내지 못한 항목은 멈추고
        여기에 남아요 — 지우기 전에는 없어지지 않아요.
      </p>
      {queue.map((item) => {
        const s = byId.get(item.propertyId);
        const check = s?.visitChecks.find((v) => v.id === item.payload.id);
        return (
          <div key={item.key} className="rc-q-item">
            <div className="rc-q-text">
              <span>{check?.title ?? '확인 항목'}</span>
              <span className="rc-q-cat">[{s?.name ?? '매물'}]</span>
            </div>
            <p className="rc-field-note">
              결과 {resultLabel(item.payload.result)} · 저장 {formatSavedAt(item.savedAt)}
              {isStuck(item) && ' · 보내기 멈춤'}
              {item.lastError && ` · 마지막 사유: ${item.lastError}`}
            </p>
            {confirming === item.key ? (
              <div className="rc-form-actions">
                <span className="rc-field-note">이 기록은 서버에 가지 않고 사라져요.</span>
                <button
                  type="button"
                  className="rc-btn rc-btn-sm rc-btn-ghost"
                  onClick={() => {
                    setConfirming(null);
                    void discardQueued(item.key);
                  }}
                >
                  지우기
                </button>
                <button type="button" className="rc-btn rc-btn-sm rc-btn-ghost" onClick={() => setConfirming(null)}>
                  취소
                </button>
              </div>
            ) : (
              <div className="rc-form-actions">
                <button
                  type="button"
                  className="rc-btn rc-btn-sm rc-btn-ghost"
                  onClick={() => setConfirming(item.key)}
                >
                  이 기기에서 지우기
                </button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
