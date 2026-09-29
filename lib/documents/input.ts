import type { DocumentKind, FieldBbox, OcrSource } from '@/db/schema';
import type { DocumentFieldInput } from '@/lib/types';
import { isFieldKeyFor } from './fields';

/**
 * saveDocument 입력 정규화 (docs/API-V2.md §3) — 순수 함수.
 *
 * 클라이언트가 보낸 값을 그대로 믿지 않는다:
 *   · 그 kind에 없는 키는 버린다. 같은 키가 두 번 오면 앞의 것만
 *   · 값은 문자열만. 공백뿐이면 null (R8 — 빈 문자열로 저장하지 않는다)
 *   · bbox는 숫자 5개가 전부 유효할 때만, confidence는 0~1일 때만
 *   · ocr_source는 OCR 보류 중이므로 pdf_text·manual만
 */

/** 확인 화면 입력 상한 — DB는 text라 제한이 없지만 화면·대조가 감당할 크기 */
const VALUE_MAX_LENGTH = 200;
const SPECIAL_TERMS_MAX_LENGTH = 4000;

export const ACCEPTED_OCR_SOURCES: readonly OcrSource[] = ['pdf_text', 'manual'];

export function isAcceptedOcrSource(v: unknown): v is OcrSource {
  return typeof v === 'string' && (ACCEPTED_OCR_SOURCES as readonly string[]).includes(v);
}

function toBbox(v: unknown): FieldBbox | null {
  if (!v || typeof v !== 'object') return null;
  const b = v as Record<string, unknown>;
  const nums = [b.page, b.x, b.y, b.w, b.h];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [page, x, y, w, h] = nums as number[];
  if (!Number.isInteger(page) || page < 1) return null;
  if (w <= 0 || h <= 0) return null;
  return { page, x, y, w, h };
}

function toConfidence(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
}

export type SanitizeResult =
  | { ok: true; fields: DocumentFieldInput[] }
  | { ok: false; error: string };

export function sanitizeFieldInputs(kind: DocumentKind, raw: unknown): SanitizeResult {
  if (!Array.isArray(raw)) return { ok: false, error: '저장할 항목이 없습니다.' };

  const seen = new Set<string>();
  const fields: DocumentFieldInput[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    if (!isFieldKeyFor(kind, f.fieldKey) || seen.has(f.fieldKey)) continue;
    seen.add(f.fieldKey);

    const text = typeof f.value === 'string' ? f.value.trim() : '';
    const max = f.fieldKey === 'special_terms' ? SPECIAL_TERMS_MAX_LENGTH : VALUE_MAX_LENGTH;
    if (text.length > max) {
      return { ok: false, error: `입력이 너무 깁니다. ${max}자 이내로 줄여 주세요.` };
    }

    fields.push({
      fieldKey: f.fieldKey,
      value: text === '' ? null : text,
      bbox: toBbox(f.bbox),
      confidence: toConfidence(f.confidence),
      editedByUser: f.editedByUser === true,
    });
  }

  return { ok: true, fields };
}
