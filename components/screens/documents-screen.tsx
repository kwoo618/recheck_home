'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { DocumentKind, FieldBbox, OcrSource } from '@/db/schema';
import type { SaveDocumentInput } from '@/lib/actions/documents';
import type { CreatePropertyInput } from '@/lib/actions/properties';
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABEL,
  fieldSpecsFor,
  type DocumentFieldKey,
} from '@/lib/documents/fields';
import {
  findValueBbox,
  PDF_TEXT_FAILURE_DETAIL,
  PDF_TEXT_FALLBACK_MESSAGE,
  type PdfToken,
} from '@/lib/documents/pdf-layout';
import { documentReadiness } from '@/lib/documents/readiness';
import { structureDocument } from '@/lib/client/document-api';
import { extractPdfText } from '@/lib/client/pdf-text';
import { deleteOriginal, listOriginals, saveOriginal, type VaultMeta } from '@/lib/client/vault';
import type { ActionResult, DiscrepancyDTO, DocumentDTO, PropertyDTO } from '@/lib/types';
import { DiscrepancyResults } from './_parts/discrepancy-results';
import { ScreenShell } from './_parts/screen-shell';
import { PropertyHeader } from './_parts/property-header';
import { SourceBadge } from './_parts/source-badge';
import type { HrefFor } from './_parts/nav';

/**
 * 문서 올리기·확인 (V2-PLAN §4-1 입력 · §4-3 준비 상태 패널)
 *
 * 흐름: 파일 고르기 → 원본은 이 기기(IndexedDB)에 보관 → PDF면 텍스트 레이어 추출 →
 *       지점 ④ 구조화 → **전 필드 편집 가능한 확인 화면** → 사람이 확인한 필드만 서버에 저장.
 *
 * ★ R9: 원본은 서버로 보내지 않는다. 서버로 가는 것은 마스킹한 추출 텍스트(④)와 확인한 필드뿐이다.
 * ★ R4: 텍스트 레이어가 없거나 ④가 실패하면 빈 확인 화면(수기 입력)으로 이어간다.
 *   이미지(촬영본·광고 캡처)는 글자를 자동으로 읽지 않는다 — OCR은 보류(2026-09-29).
 * ★ R7: 이 화면은 인쇄·공유 경로가 없다. 상세주소·특약 원문은 화면 표시만 한다.
 * ★ 대조: 준비 상태 패널은 2종 이상인지만 보여 주고, onCompare가 없으면 버튼을 잠근다.
 *   결과는 이 화면 아래(DiscrepancyResults)에 나란히 보인다. 판정은 lib/compare가 하고 화면은 옮겨 그리기만 한다.
 */
export type DocumentsScreenProps = {
  property: PropertyDTO;
  documents: DocumentDTO[];
  hrefFor: HrefFor;
  /** Server Action saveDocument */
  onSave: (input: SaveDocumentInput) => Promise<ActionResult<{ documentId: string }>>;
  /** Server Action deleteDocument */
  onDelete: (documentId: string) => Promise<ActionResult<void>>;
  /** 광고 문구 → 지점 ① (POST /api/ai/parse). 없으면 붙여넣기 칸을 그리지 않는다 */
  onParseAd?: (text: string) => Promise<{ ok: boolean; data?: Partial<CreatePropertyInput> }>;
  /** 대조 실행 — Server Action runCompare. 없으면 대조 버튼은 잠긴 채로 보인다 */
  onCompare?: (propertyId: string) => Promise<ActionResult<{ discrepancies: DiscrepancyDTO[] }>>;
  /** 마지막 대조 결과 (listDiscrepancies). 대조한 적 없으면 [] */
  discrepancies?: DiscrepancyDTO[];
};

type Origin = 'ai' | 'user';

type Draft = {
  kind: DocumentKind;
  ocrSource: OcrSource;
  values: Partial<Record<DocumentFieldKey, string>>;
  /** 처음 채워진 값 — 이것과 달라지면 edited_by_user */
  initial: Partial<Record<DocumentFieldKey, string | null>>;
  /** 처음 값이 AI(④·①)에서 왔는가 */
  initialOrigin: Partial<Record<DocumentFieldKey, Origin>>;
  savedBbox: Partial<Record<DocumentFieldKey, FieldBbox | null>>;
  /** 이번에 추출한 PDF 토큰 — 저장하지 않는다. 값 위치(bbox) 계산에만 쓴다 */
  tokens: PdfToken[];
  notice: string | null;
};

const IMAGE_NOTICE =
  '사진·캡처는 글자를 자동으로 읽지 않습니다. 원본은 이 기기에 보관했어요. 원본을 보며 직접 입력해 주세요.';

function emptyDraft(kind: DocumentKind, notice: string | null): Draft {
  return { kind, ocrSource: 'manual', values: {}, initial: {}, initialOrigin: {}, savedBbox: {}, tokens: [], notice };
}

function draftFromSaved(doc: DocumentDTO): Draft {
  const d = emptyDraft(doc.kind, null);
  d.ocrSource = doc.ocrSource;
  for (const f of doc.fields) {
    const key = f.fieldKey as DocumentFieldKey;
    d.values[key] = f.value ?? '';
    d.initial[key] = f.value;
    d.initialOrigin[key] = f.editedByUser || doc.ocrSource === 'manual' ? 'user' : 'ai';
    d.savedBbox[key] = f.bbox;
  }
  return d;
}

/** ① 결과(만원·㎡ 숫자) → 광고 필드 초안. 주소·면적은 채우지 않는다 — 표기 종류를 알 수 없다 */
function draftFromAdParse(data: Partial<CreatePropertyInput>): Draft {
  const d = emptyDraft('ad', 'AI가 읽은 값은 틀릴 수 있어요. 광고 원문과 한 칸씩 맞춰 보세요.');
  const put = (key: DocumentFieldKey, v: string | null) => {
    if (!v) return;
    d.values[key] = v;
    d.initial[key] = v;
    d.initialOrigin[key] = 'ai';
  };
  const won = (v: unknown) => (v === undefined || v === '' ? null : `${v}만원`);
  if (data.dealType === '월세') {
    put('deposit', won(data.deposit));
    put('rent', won(data.price));
  } else if (data.dealType === '전세') {
    put('deposit', won(data.price));
  }
  put('maintenance_fee', won(data.mgmtFee));
  put('floor', data.floor ? `${data.floor}층` : null);
  return d;
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(bytes / 1024)}KB`;
}

export function DocumentsScreen({
  property: p,
  documents,
  hrefFor,
  onSave,
  onDelete,
  onParseAd,
  onCompare,
  discrepancies = [],
}: DocumentsScreenProps) {
  const router = useRouter();
  const [originals, setOriginals] = useState<VaultMeta[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busyKind, setBusyKind] = useState<DocumentKind | null>(null);
  const [saving, setSaving] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState('');
  const [adText, setAdText] = useState('');

  const saved = new Map(documents.map((d) => [d.kind, d]));
  const readiness = documentReadiness(documents.map((d) => d.kind));

  useEffect(() => {
    let alive = true;
    void listOriginals(p.id).then((list) => {
      if (alive) setOriginals(list);
    });
    return () => {
      alive = false;
    };
  }, [p.id]);

  async function refreshOriginals() {
    setOriginals(await listOriginals(p.id));
  }

  async function handleFile(kind: DocumentKind, file: File) {
    setError('');
    setBusyKind(kind);
    try {
      const stored = await saveOriginal(p.id, kind, file);
      await refreshOriginals();
      const vaultNote = stored ? null : '이 기기에 원본을 보관하지 못했어요(브라우저 저장소를 쓸 수 없음).';

      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (!isPdf || kind === 'ad') {
        setDraft(emptyDraft(kind, [IMAGE_NOTICE, vaultNote].filter(Boolean).join(' ')));
        return;
      }

      const extracted = await extractPdfText(file);
      if (!extracted.ok) {
        const notice = `${PDF_TEXT_FALLBACK_MESSAGE}. ${PDF_TEXT_FAILURE_DETAIL[extracted.reason]}`;
        setDraft(emptyDraft(kind, [notice, vaultNote].filter(Boolean).join(' ')));
        return;
      }

      const structured = await structureDocument(p.id, kind, extracted.text);
      if (!structured.ok) {
        setDraft({ ...emptyDraft(kind, structured.reason), tokens: extracted.tokens });
        return;
      }

      const d = emptyDraft(kind, 'AI가 읽은 값은 틀릴 수 있어요. 원본과 한 칸씩 맞춰 보세요. 문서에서 찾지 못한 칸은 비워 두었습니다.');
      d.ocrSource = 'pdf_text';
      d.tokens = extracted.tokens;
      for (const f of structured.fields) {
        if (f.value === null) continue;
        d.values[f.fieldKey] = f.value;
        d.initial[f.fieldKey] = f.value;
        d.initialOrigin[f.fieldKey] = 'ai';
      }
      if (vaultNote) d.notice = `${d.notice} ${vaultNote}`;
      setDraft(d);
    } finally {
      setBusyKind(null);
    }
  }

  async function handleAdParse() {
    if (!onParseAd || !adText.trim()) return;
    setError('');
    setBusyKind('ad');
    try {
      const result = await onParseAd(adText.trim());
      setDraft(
        result.ok && result.data
          ? draftFromAdParse(result.data)
          : emptyDraft('ad', '자동으로 읽지 못했습니다. 직접 입력해 주세요.'),
      );
    } finally {
      setBusyKind(null);
    }
  }

  async function handleRemoveOriginal(id: string) {
    await deleteOriginal(id);
    await refreshOriginals();
  }

  async function handleDeleteDocument(doc: DocumentDTO) {
    setError('');
    const result = await onDelete(doc.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleCompare() {
    if (!onCompare || comparing) return;
    setComparing(true);
    setError('');
    try {
      const result = await onCompare(p.id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    } catch {
      setError('지금 대조할 수 없어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setComparing(false);
    }
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError('');

    const fields = fieldSpecsFor(draft.kind).map((spec) => {
      const raw = (draft.values[spec.key] ?? '').trim();
      const value = raw === '' ? null : raw;
      const initial = draft.initial[spec.key] ?? null;
      // AI가 채운 칸은 바꾸거나 비웠을 때, 사람이 채운 칸은 값이 있을 때 사용자 입력이다
      const editedByUser = draft.initialOrigin[spec.key] === 'ai' ? value !== initial : value !== null;
      // 값이 그대로면 저장된 위치를 쓰고, 이번 추출 토큰이 있으면 다시 찾는다. 못 찾으면 null(위치 추정)
      const bbox =
        draft.tokens.length > 0
          ? findValueBbox(draft.tokens, value)
          : value === initial
            ? (draft.savedBbox[spec.key] ?? null)
            : null;
      return { fieldKey: spec.key, value, bbox, confidence: null, editedByUser };
    });

    try {
      const result = await onSave({ propertyId: p.id, kind: draft.kind, ocrSource: draft.ocrSource, fields });
      if (!result.ok) {
        setError(result.error);
        setSaving(false);
        return;
      }
      setDraft(null);
      router.refresh();
    } catch {
      setError('지금 저장할 수 없어요. 잠시 후 다시 시도해 주세요.');
    }
    setSaving(false);
  }

  if (draft) {
    const specs = fieldSpecsFor(draft.kind);
    return (
      <ScreenShell hrefFor={hrefFor}>
        <PropertyHeader property={p} phase="documents" hrefFor={hrefFor} />
        <div className="rc-card">
          <h2 className="rc-card-title">
            {DOCUMENT_KIND_LABEL[draft.kind]} 내용 확인 <SourceBadge kind="user" label="사람 확인" />
          </h2>
          <p className="rc-card-sub">
            모든 칸을 고칠 수 있어요. 문서에 없는 칸은 비워 두세요 — 비운 칸은 &lsquo;찾지 못함&rsquo;으로
            저장됩니다.
          </p>
          {draft.notice && <p className="rc-notice rc-notice-info">{draft.notice}</p>}

          <div className="rc-fgrid">
            {specs.map((spec) => {
              const value = draft.values[spec.key] ?? '';
              const fromAi = draft.initialOrigin[spec.key] === 'ai' && value === (draft.initial[spec.key] ?? '');
              const id = `doc-${spec.key}`;
              const setValue = (v: string) =>
                setDraft((prev) => (prev ? { ...prev, values: { ...prev.values, [spec.key]: v } } : prev));
              return (
                <div key={spec.key} className={spec.key === 'special_terms' ? 'rc-screen-only' : undefined}>
                  <label className="rc-fl" htmlFor={id}>
                    {spec.label}{' '}
                    {value.trim() !== '' && <SourceBadge kind={fromAi ? 'ai' : 'user'} />}
                  </label>
                  {spec.multiline ? (
                    <textarea
                      id={id}
                      className="rc-textarea"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  ) : (
                    <input
                      id={id}
                      className="rc-input"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  )}
                  {spec.note && <p className="rc-field-note">{spec.note}</p>}
                </div>
              );
            })}
          </div>

          {error && <p className="rc-error">{error}</p>}

          <div className="rc-form-actions">
            <button
              type="button"
              className="rc-btn rc-btn-primary"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? '저장하는 중...' : '확인한 내용 저장'}
            </button>
            <button type="button" className="rc-btn rc-btn-ghost" disabled={saving} onClick={() => setDraft(null)}>
              취소
            </button>
          </div>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell hrefFor={hrefFor}>
      <PropertyHeader property={p} phase="documents" hrefFor={hrefFor} />

      <section className="rc-card">
        <h2 className="rc-card-title">
          문서 준비 상태 <SourceBadge kind="rule" />
        </h2>
        <p className="rc-card-sub">{readiness.summary}</p>
        {readiness.reason && <p className="rc-field-note">{readiness.reason}</p>}
        <div className="rc-form-actions">
          <button
            type="button"
            className="rc-btn rc-btn-primary"
            disabled={!readiness.canCompare || !onCompare || comparing}
            onClick={() => void handleCompare()}
          >
            {comparing ? '대조하는 중...' : discrepancies.length > 0 ? '다시 대조하기' : '문서 대조하기'}
          </button>
        </div>
        {discrepancies.length > 0 && (
          <p className="rc-field-note">문서 내용을 고쳤다면 다시 대조해 주세요. 아래 결과는 마지막 대조 기준입니다.</p>
        )}
      </section>

      {(discrepancies.length > 0 || readiness.canCompare) && (
        <DiscrepancyResults discrepancies={discrepancies} documents={documents} originals={originals} />
      )}

      <p className="rc-notice">
        원본 파일은 <b>이 기기에만</b> 보관하고 서버로 보내지 않습니다. 브라우저 데이터를 지우면 원본도
        사라질 수 있어요. PDF에서 읽은 글자는 주민등록번호·생년월일을 가린 뒤 AI 정리에 씁니다.
      </p>

      {error && <p className="rc-error">{error}</p>}

      {DOCUMENT_KINDS.map((kind) => {
        const doc = saved.get(kind);
        const files = originals.filter((o) => o.kind === kind);
        const busy = busyKind === kind;
        const accept = kind === 'ad' ? 'image/*' : 'application/pdf,image/*';
        return (
          <section key={kind} className="rc-card">
            <h2 className="rc-card-title">
              {DOCUMENT_KIND_LABEL[kind]} {doc ? '○' : '×'}{' '}
              {doc && <SourceBadge kind={doc.ocrSource === 'pdf_text' ? 'ai' : 'user'} label={doc.ocrSource === 'pdf_text' ? 'AI 정리 + 사람 확인' : '직접 입력'} />}
            </h2>
            <p className="rc-card-sub">
              {kind === 'registry' && '인터넷등기소에서 받은 등기사항전부증명서 PDF를 올려 주세요.'}
              {kind === 'contract' && '표준 임대차계약서 PDF(초안·본계약 모두)를 올려 주세요.'}
              {kind === 'ad' && '광고 캡처를 보관하고, 광고 문구는 붙여넣거나 직접 입력해 주세요.'}
            </p>

            {files.length > 0 && (
              <ul className="rc-field-note">
                {files.map((f) => (
                  <li key={f.id}>
                    {f.name} · {formatSize(f.size)} · 이 기기에 보관{' '}
                    <button
                      type="button"
                      className="rc-btn rc-btn-ghost rc-btn-sm"
                      onClick={() => void handleRemoveOriginal(f.id)}
                    >
                      원본 지우기
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {kind === 'ad' && onParseAd && (
              <div>
                <label className="rc-fl" htmlFor="doc-ad-text">
                  광고 문구 붙여넣기
                </label>
                <textarea
                  id="doc-ad-text"
                  className="rc-textarea"
                  value={adText}
                  placeholder="직방·다방 광고의 설명을 복사해 붙여넣으세요"
                  onChange={(e) => setAdText(e.target.value)}
                />
              </div>
            )}

            <div className="rc-form-actions">
              <label className="rc-btn rc-btn-ghost" aria-disabled={busy}>
                {busy ? '읽는 중...' : '파일 올리기'}
                <input
                  type="file"
                  accept={accept}
                  hidden
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleFile(kind, file);
                  }}
                />
              </label>
              {kind === 'ad' && onParseAd && (
                <button
                  type="button"
                  className="rc-btn rc-btn-ghost"
                  disabled={busy || !adText.trim()}
                  onClick={() => void handleAdParse()}
                >
                  붙여넣은 문구로 채우기
                </button>
              )}
              <button
                type="button"
                className="rc-btn rc-btn-ghost"
                disabled={busy}
                onClick={() => setDraft(doc ? draftFromSaved(doc) : emptyDraft(kind, null))}
              >
                {doc ? '저장한 내용 고치기' : '직접 입력'}
              </button>
              {doc && (
                <button
                  type="button"
                  className="rc-btn rc-btn-ghost rc-btn-danger"
                  disabled={busy}
                  onClick={() => void handleDeleteDocument(doc)}
                >
                  저장한 내용 지우기
                </button>
              )}
            </div>
          </section>
        );
      })}

      <div className="rc-form-actions">
        <Link href={hrefFor('safety', p.id)} className="rc-btn rc-btn-ghost">
          계약 전 안전 점검으로
        </Link>
      </div>
    </ScreenShell>
  );
}
