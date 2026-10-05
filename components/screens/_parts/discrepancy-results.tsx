'use client';

import { useEffect, useRef, useState } from 'react';
import type { DocumentKind, FieldBbox } from '@/db/schema';
import { DOCUMENT_COMPARE_DISCLAIMER } from '@/lib/ai/disclaimer';
import { findPair, STANDALONE_KEYS } from '@/lib/compare/pairs';
import { discrepancySentence, NEEDS_REVIEW_NOTE, sideName, STATUS_LABEL } from '@/lib/compare/text';
import { FIELD_SPECS } from '@/lib/documents/fields';
import { getOriginal, type VaultMeta } from '@/lib/client/vault';
import { renderPdfPage } from '@/lib/client/pdf-text';
import type { DiscrepancyDTO, DocumentDTO } from '@/lib/types';
import { SourceBadge } from './source-badge';

/**
 * 문서 대조 결과 (V2-PLAN §4-1 "표시")
 *
 *   "{docA}에는 [a], {docB}에는 [b]로 기재되어 있습니다"
 *
 * ★ 중립 톤 · 두 값 나란히 · 색 강조 없음. 상태 라벨도 모든 행이 같은 모양이다 (R1).
 * ★ 면책(DOCUMENT_COMPARE_DISCLAIMER)은 결과 유무와 무관하게 상시.
 * ★ 원본이 기기에 없어도 결과는 보인다. 하이라이트만 비활성이다.
 *   bbox가 없으면 "위치 추정" — 칠하지 않는다. 엉뚱한 곳을 칠하면 틀린 사실을 보여 주는 것이다.
 *   같은 종류 PDF 원본이 둘 이상이면 어느 파일에서 읽은 값인지 모르므로 칠하지 않는다.
 * ★ R7: 대조 행에는 상세주소·특약 원문이 없다(lib/compare/pairs). 이 화면은 인쇄 경로가 없다.
 */

type Side = { kind: DocumentKind; label: string; value: string | null; bbox: FieldBbox | null };

function bboxOf(documents: DocumentDTO[], kind: DocumentKind, key: string): FieldBbox | null {
  const doc = documents.find((d) => d.kind === kind);
  return doc?.fields.find((f) => f.fieldKey === key)?.bbox ?? null;
}

/** 하이라이트할 원본: 그 종류의 PDF 원본이 딱 하나일 때만 */
function pdfOriginal(originals: VaultMeta[], kind: DocumentKind): VaultMeta | null {
  const pdfs = originals.filter((o) => o.kind === kind && (o.type === 'application/pdf' || /\.pdf$/i.test(o.name)));
  return pdfs.length === 1 ? pdfs[0] : null;
}

function OriginalHighlight({ originalId, bbox }: { originalId: string; bbox: FieldBbox }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let alive = true;
    void (async () => {
      const entry = await getOriginal(originalId);
      const canvas = canvasRef.current;
      const width = Math.min(boxRef.current?.clientWidth ?? 320, 720);
      const ok = entry && canvas ? await renderPdfPage(entry.blob, bbox.page, canvas, width) : false;
      if (alive) setState(ok ? 'ready' : 'failed');
    })();
    return () => {
      alive = false;
    };
  }, [originalId, bbox.page]);

  return (
    <div ref={boxRef} style={{ marginTop: 8 }}>
      {state === 'loading' && (
        <p className="rc-field-note">
          <span className="rc-spinner" /> 이 기기의 원본을 여는 중...
        </p>
      )}
      {state === 'failed' && <p className="rc-field-note">원본을 열지 못했습니다. 결과는 그대로 확인할 수 있어요.</p>}
      <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }} hidden={state !== 'ready'}>
        <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%' }} />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: `${bbox.x * 100}%`,
            top: `${bbox.y * 100}%`,
            width: `${bbox.w * 100}%`,
            height: `${bbox.h * 100}%`,
            outline: '2px solid var(--rc-ink)',
            outlineOffset: 2,
          }}
        />
      </div>
      <p className="rc-field-note">
        {bbox.page}쪽. 표시는 저장할 때 찾은 위치이며, 원본에서 한 번 더 확인해 주세요.
      </p>
    </div>
  );
}

function SideCell({
  side,
  original,
  open,
  onToggle,
}: {
  side: Side;
  original: VaultMeta | null;
  open: boolean;
  onToggle: () => void;
}) {
  const canHighlight = side.bbox !== null && original !== null && side.value !== null;
  return (
    <div>
      <span className="rc-fl">{side.label}</span>
      <div>{side.value === null ? '찾지 못함' : side.value}</div>
      {side.value !== null && (
        <div className="rc-field-note">
          {canHighlight ? (
            <button type="button" className="rc-btn rc-btn-ghost rc-btn-sm" onClick={onToggle}>
              {open ? '원본 닫기' : '원본에서 위치 보기'}
            </button>
          ) : side.bbox === null ? (
            '위치 추정 — 원본에서 직접 찾아 주세요.'
          ) : (
            '이 기기에 원본이 없거나 하나로 정해지지 않아 위치를 표시하지 않습니다.'
          )}
        </div>
      )}
      {open && side.bbox && original && <OriginalHighlight originalId={original.id} bbox={side.bbox} />}
    </div>
  );
}

export function DiscrepancyResults({
  discrepancies,
  documents,
  originals,
}: {
  discrepancies: DiscrepancyDTO[];
  documents: DocumentDTO[];
  originals: VaultMeta[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const registry = documents.find((d) => d.kind === 'registry');
  const standalone = registry
    ? STANDALONE_KEYS.map((key) => ({
        key,
        label: FIELD_SPECS.find((s) => s.key === key)?.label ?? key,
        value: registry.fields.find((f) => f.fieldKey === key)?.value ?? null,
      }))
    : [];

  return (
    <section className="rc-card">
      <h2 className="rc-card-title">
        문서 대조 결과 <SourceBadge kind="rule" />
      </h2>
      <p className="rc-notice">{DOCUMENT_COMPARE_DISCLAIMER}</p>

      {discrepancies.length === 0 ? (
        <p className="rc-field-note">아직 대조한 결과가 없습니다. 문서를 2종 이상 저장한 뒤 대조해 주세요.</p>
      ) : (
        discrepancies.map((d) => {
          const pair = findPair(d.fieldKey, d.docA, d.docB);
          if (!pair) return null;
          const sides: [Side, Side] = [
            {
              kind: d.docA,
              label: sideName(pair.a.kind, pair.a.label),
              value: d.valueA,
              bbox: bboxOf(documents, pair.a.kind, pair.a.key),
            },
            {
              kind: d.docB,
              label: sideName(pair.b.kind, pair.b.label),
              value: d.valueB,
              bbox: bboxOf(documents, pair.b.kind, pair.b.key),
            },
          ];
          return (
            <div key={d.id} className="rc-q-item">
              <h3 className="rc-group-label">
                {pair.label} · {STATUS_LABEL[d.status]}
              </h3>
              <p>{discrepancySentence(pair, d.valueA, d.valueB, d.status)}</p>
              {d.status === 'needs_review' && <p className="rc-field-note">{NEEDS_REVIEW_NOTE}</p>}
              {d.status !== 'missing_not_applicable' && (
                <div className="rc-fgrid" style={{ marginTop: 8 }}>
                  {sides.map((side, i) => {
                    const id = `${d.id}-${i}`;
                    return (
                      <SideCell
                        key={id}
                        side={side}
                        original={pdfOriginal(originals, side.kind)}
                        open={open === id}
                        onToggle={() => setOpen((cur) => (cur === id ? null : id))}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}

      {standalone.length > 0 && (
        <>
          <h3 className="rc-group-label">등기부에 적힌 그대로 (비교하지 않는 항목)</h3>
          {standalone.map((s) => (
            <div key={s.key} className="rc-q-item">
              <span className="rc-fl">{s.label}</span>
              <div>{s.value ?? '찾지 못함'}</div>
            </div>
          ))}
          <p className="rc-field-note">
            합산하거나 말소 여부를 가리지 않고 확인 화면에 적은 표기를 그대로 보여 줍니다. 원본에서 확인하세요.
          </p>
        </>
      )}
    </section>
  );
}
